import { planMagis, type MagisIssueInput, type MagisPlan } from "./orchestrator.js";
export { default as manifest } from "./manifest.js";

export interface WebhookInput {
  endpointKey: string;
  method?: string;
  body?: unknown;
  query?: Record<string, string>;
}

export interface WebhookResponse {
  status: number;
  body?: unknown;
}

export interface MagisPluginCtx {
  savePlan?: (plan: MagisPlan) => Promise<void>;
  readPlan?: (issue_id: string) => Promise<MagisPlan | null>;
  logActivity?: (action: string, details: Record<string, unknown>) => Promise<void>;
}

export async function onWebhook(
  input: WebhookInput,
  ctx: MagisPluginCtx,
): Promise<WebhookResponse> {
  switch (input.endpointKey) {
    case "plan-issue":
      return await handlePlanIssue(input, ctx);
    case "get-plan":
      return await handleGetPlan(input, ctx);
    default:
      return {
        status: 404,
        body: { error: "unknown_endpoint", endpointKey: input.endpointKey },
      };
  }
}

async function handlePlanIssue(
  input: WebhookInput,
  ctx: MagisPluginCtx,
): Promise<WebhookResponse> {
  if (input.method && input.method.toUpperCase() !== "POST") {
    return { status: 405, body: { error: "method_not_allowed", allowed: ["POST"] } };
  }
  const parsed = parseIssueInput(input.body);
  if (!parsed.ok) {
    return { status: 400, body: { error: "invalid_body", detail: parsed.error } };
  }
  const plan = planMagis(parsed.value);
  await ctx.savePlan?.(plan);
  await ctx.logActivity?.("magis_lite_planned", {
    issue_id: plan.issue_id,
    sub_issue_count: plan.sub_issues.length,
    warnings: plan.warnings,
  });
  return { status: 200, body: plan };
}

async function handleGetPlan(
  input: WebhookInput,
  ctx: MagisPluginCtx,
): Promise<WebhookResponse> {
  const issue_id = readIssueId(input);
  if (!issue_id) return { status: 400, body: { error: "issue_id required" } };
  if (!ctx.readPlan) {
    return { status: 501, body: { error: "read_backend_unavailable" } };
  }
  const plan = await ctx.readPlan(issue_id);
  if (!plan) return { status: 404, body: { error: "plan_not_found", issue_id } };
  return { status: 200, body: plan };
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseIssueInput(raw: unknown): ParseResult<MagisIssueInput> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const obj = raw as Record<string, unknown>;
  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  if (!title) return { ok: false, error: "title required" };
  const body = typeof obj.body === "string" ? obj.body : "";
  const value: MagisIssueInput = { title, body };
  if (typeof obj.issue_id === "string" && obj.issue_id.trim().length > 0) {
    value.issue_id = obj.issue_id.trim();
  }
  if (typeof obj.repo_root === "string") value.repo_root = obj.repo_root;
  if (typeof obj.test_command === "string") value.test_command = obj.test_command;
  return { ok: true, value };
}

function readIssueId(input: WebhookInput): string | null {
  if (input.query && typeof input.query.issue_id === "string") {
    return input.query.issue_id.trim() || null;
  }
  if (input.body && typeof input.body === "object" && !Array.isArray(input.body)) {
    const id = (input.body as Record<string, unknown>).issue_id;
    if (typeof id === "string") return id.trim() || null;
  }
  return null;
}

export default { onWebhook };
