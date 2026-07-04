/**
 * Campaign Workflow worker.
 *
 * Two webhook endpoints:
 *   - `submit-brief` (POST) → CampaignBrief → OrchestratorPlan
 *   - `campaign-status` (GET/POST) → read plugin_state for a campaign_id
 *
 * SDK contract: `onWebhook(input)` + switch on `input.endpointKey` (per E-4 /
 * D-M2-05). Actual issue creation on the paperclip core is left to the caller
 * so the plan-only step stays deterministic and easy to test.
 */

import { planCampaignSync } from "./orchestrator.js";
import type {
  BrandAssetsSnapshot,
  CampaignBrief,
  OrchestratorPlan,
} from "./orchestrator.js";
import { isBrandAssetScope } from "./entities.js";
export { default as manifest } from "./manifest.js";

// ---------------------------------------------------------------------------
// Webhook contracts (a subset of SDK types — enough for tests)
// ---------------------------------------------------------------------------

export interface WebhookInput {
  endpointKey: string;
  method?: string;
  body?: unknown;
  query?: Record<string, string>;
}

export interface WebhookResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Minimal ctx we need for state access + activity log. Concrete SDK ctx has more. */
export interface CampaignWorkflowCtx {
  /** Fetch brand assets by scope. Returns partial snapshot; missing scopes are OK. */
  fetchBrandAssets?: (scopes: string[]) => Promise<BrandAssetsSnapshot>;
  /** Read campaign state from plugin_state. */
  readCampaignState?: (campaign_id: string) => Promise<CampaignStateRecord | null>;
  /** Optional activity log sink. */
  logActivity?: (action: string, details: Record<string, unknown>) => Promise<void>;
}

export interface CampaignStateRecord {
  campaign_id: string;
  status: "planned" | "in_progress" | "completed" | "partial" | "failed";
  parent_issue_id?: string;
  child_issue_ids?: string[];
  outputs?: Record<string, unknown>;
  updated_at: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// onWebhook entrypoint
// ---------------------------------------------------------------------------

export async function onWebhook(
  input: WebhookInput,
  ctx: CampaignWorkflowCtx,
): Promise<WebhookResponse> {
  switch (input.endpointKey) {
    case "submit-brief":
      return await handleSubmitBrief(input, ctx);
    case "campaign-status":
      return await handleCampaignStatus(input, ctx);
    default:
      return {
        status: 404,
        body: { error: "unknown_endpoint", endpointKey: input.endpointKey },
      };
  }
}

async function handleSubmitBrief(
  input: WebhookInput,
  ctx: CampaignWorkflowCtx,
): Promise<WebhookResponse> {
  if (input.method && input.method.toUpperCase() !== "POST") {
    return { status: 405, body: { error: "method_not_allowed", allowed: ["POST"] } };
  }
  const parsed = parseCampaignBrief(input.body);
  if (!parsed.ok) {
    return { status: 400, body: { error: "invalid_body", detail: parsed.error } };
  }
  const brief = parsed.value;

  const assets = ctx.fetchBrandAssets
    ? await ctx.fetchBrandAssets([
        "brand_voice",
        "target_audience",
        "product_info",
        "compliance_rules",
      ])
    : {};

  const plan: OrchestratorPlan = planCampaignSync(brief, assets);

  await ctx.logActivity?.("campaign_planned", {
    campaign_id: plan.campaign_id,
    children_count: plan.children.length,
    warnings: plan.warnings,
  });

  return { status: 200, body: plan };
}

async function handleCampaignStatus(
  input: WebhookInput,
  ctx: CampaignWorkflowCtx,
): Promise<WebhookResponse> {
  const campaign_id = readCampaignIdFromRequest(input);
  if (!campaign_id) {
    return { status: 400, body: { error: "campaign_id required" } };
  }
  if (!ctx.readCampaignState) {
    return {
      status: 501,
      body: { error: "state_backend_unavailable", campaign_id },
    };
  }
  const state = await ctx.readCampaignState(campaign_id);
  if (!state) {
    return { status: 404, body: { error: "campaign_not_found", campaign_id } };
  }
  return { status: 200, body: state };
}

// ---------------------------------------------------------------------------
// Body / query parsing
// ---------------------------------------------------------------------------

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseCampaignBrief(raw: unknown): ParseResult<CampaignBrief> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const obj = raw as Record<string, unknown>;
  const brief = typeof obj.brief === "string" ? obj.brief.trim() : "";
  if (brief.length === 0) return { ok: false, error: "brief required (non-empty string)" };
  if (brief.length > 4000) return { ok: false, error: "brief too long (max 4000 chars)" };

  const socialChannels = readStringArray(obj.socialChannels, [
    "twitter",
    "linkedin",
    "instagram",
    "threads",
    "weibo",
  ]);
  if (socialChannels.ok === false) return socialChannels;

  const adPlatforms = readStringArray(obj.adPlatforms, [
    "meta",
    "google_search",
    "google_display",
    "linkedin",
    "tiktok",
  ]);
  if (adPlatforms.ok === false) return adPlatforms;

  let blogWordCount: number | undefined;
  if (obj.blogWordCount !== undefined) {
    if (typeof obj.blogWordCount !== "number" || obj.blogWordCount <= 0 || obj.blogWordCount > 10000) {
      return { ok: false, error: "blogWordCount must be a positive number ≤ 10000" };
    }
    blogWordCount = obj.blogWordCount;
  }

  let cta: CampaignBrief["cta"];
  if (obj.cta !== undefined) {
    if (!obj.cta || typeof obj.cta !== "object" || Array.isArray(obj.cta)) {
      return { ok: false, error: "cta must be { text, url }" };
    }
    const cobj = obj.cta as Record<string, unknown>;
    if (typeof cobj.text !== "string" || typeof cobj.url !== "string") {
      return { ok: false, error: "cta.text + cta.url required (strings)" };
    }
    cta = { text: cobj.text, url: cobj.url };
  }

  const campaignId = typeof obj.campaignId === "string" && obj.campaignId.trim().length > 0
    ? obj.campaignId.trim()
    : undefined;

  return {
    ok: true,
    value: {
      brief,
      socialChannels: socialChannels.value as CampaignBrief["socialChannels"],
      adPlatforms: adPlatforms.value as CampaignBrief["adPlatforms"],
      ...(blogWordCount !== undefined ? { blogWordCount } : {}),
      ...(cta ? { cta } : {}),
      ...(campaignId ? { campaignId } : {}),
    },
  };
}

function readStringArray(
  raw: unknown,
  allowed: string[],
): { ok: true; value: string[] | undefined } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(raw)) return { ok: false, error: "expected array" };
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string" || !allowed.includes(entry)) {
      return {
        ok: false,
        error: `entry ${JSON.stringify(entry)} not in allowed set [${allowed.join(", ")}]`,
      };
    }
    out.push(entry);
  }
  return { ok: true, value: out };
}

function readCampaignIdFromRequest(input: WebhookInput): string | null {
  if (input.query && typeof input.query.campaign_id === "string") {
    return input.query.campaign_id.trim() || null;
  }
  if (input.body && typeof input.body === "object" && !Array.isArray(input.body)) {
    const cid = (input.body as Record<string, unknown>).campaign_id;
    if (typeof cid === "string") return cid.trim() || null;
  }
  return null;
}

// re-export for tests that want to sanity-check the entity scope surface
export { isBrandAssetScope };

export default { onWebhook };
