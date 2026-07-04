/**
 * Campaign Workflow orchestrator.
 *
 * Given a CampaignBrief + optional brand assets, plan a parent issue and its
 * child issues (blog / social / ads). Returns a pure plan — the actual issue
 * creation is done by paperclip core via a separate call, keeping this layer
 * deterministic and testable.
 *
 * M2 W7-D1 core. Handbook §W7.D1 says "orchestrator 拆 3 child issue (blog /
 * social / ads)". We return a plan that can be materialized to core.
 */

import type { SocialChannel } from "./prompts/social.js";
import { socialCountForCampaignBrief, renderSocialPrompt } from "./prompts/social.js";
import type { AdPlatform } from "./prompts/ads.js";
import { renderAdsPrompt } from "./prompts/ads.js";
import { renderBlogPrompt } from "./prompts/blog.js";
import type { BrandAssetPayloadMap } from "./entities.js";

// ---------------------------------------------------------------------------
// Brief input (what the human submits)
// ---------------------------------------------------------------------------

export interface CampaignBrief {
  /** Free-form campaign summary (goal, hook, angle). */
  brief: string;
  /** Channels to produce output for. Empty → default to twitter + linkedin. */
  socialChannels?: SocialChannel[];
  /** Ad platforms to produce copy for. Empty → skip ads sub-issue. */
  adPlatforms?: AdPlatform[];
  /** Blog target word count. Default 800. */
  blogWordCount?: number;
  /** CTA rendered in blog + used in ads if platform allows. */
  cta?: { text: string; url: string };
  /** Explicit campaign identifier; if omitted the orchestrator mints one. */
  campaignId?: string;
}

// ---------------------------------------------------------------------------
// Brand assets input (fetched from plugin_entities before planning)
// ---------------------------------------------------------------------------

export interface BrandAssetsSnapshot {
  brand_voice?: BrandAssetPayloadMap["brand_voice"];
  target_audience?: BrandAssetPayloadMap["target_audience"];
  product_info?: BrandAssetPayloadMap["product_info"];
  compliance_rules?: BrandAssetPayloadMap["compliance_rules"];
}

// ---------------------------------------------------------------------------
// Plan output
// ---------------------------------------------------------------------------

export type SubIssueKind = "blog" | "social" | "ads";

export interface PlannedSubIssue {
  kind: SubIssueKind;
  title: string;
  /** Suggested skill(s) to hire the child agent with. */
  suggested_skills: string[];
  /** The rendered prompt the child agent should execute. */
  prompt: string;
  /** Metadata for downstream aggregation (channel/platform for social/ads). */
  metadata: Record<string, unknown>;
}

export interface OrchestratorPlan {
  campaign_id: string;
  parent_issue: {
    title: string;
    body: string;
  };
  children: PlannedSubIssue[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Defaults & constants
// ---------------------------------------------------------------------------

const DEFAULT_BLOG_WORD_COUNT = 800;
const DEFAULT_SOCIAL_CHANNELS: SocialChannel[] = ["twitter", "linkedin"];
const DEFAULT_BRAND_VOICE: BrandAssetPayloadMap["brand_voice"] = {
  tone: "professional",
  vocabulary_do: [],
  vocabulary_dont: [],
};
const DEFAULT_TARGET_AUDIENCE: BrandAssetPayloadMap["target_audience"] = {
  segment_name: "general audience",
  persona_summary: "General audience — no target_audience brand asset provided.",
  pain_points: [],
  goals: [],
};

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Plan a campaign given a brief and (optional) brand assets. Pure function.
 *
 * The plan is deterministic given identical inputs — no random ids, no
 * timestamps — so tests can assert exact shape without freezing time.
 */
export async function planCampaign(
  brief: CampaignBrief,
  assets: BrandAssetsSnapshot,
): Promise<OrchestratorPlan> {
  return planCampaignSync(brief, assets);
}

/** Sync variant for tests / callers that don't need the async guarantee. */
export function planCampaignSync(
  brief: CampaignBrief,
  assets: BrandAssetsSnapshot,
): OrchestratorPlan {
  const warnings: string[] = [];
  const campaign_id = brief.campaignId?.trim() || slugifyCampaign(brief.brief);

  const brandVoice = assets.brand_voice ?? DEFAULT_BRAND_VOICE;
  const targetAudience = assets.target_audience ?? DEFAULT_TARGET_AUDIENCE;
  if (!assets.brand_voice) warnings.push("no brand_voice asset — using neutral defaults");
  if (!assets.target_audience)
    warnings.push("no target_audience asset — using generic persona");

  const socialChannels = brief.socialChannels?.length
    ? brief.socialChannels
    : DEFAULT_SOCIAL_CHANNELS;
  const adPlatforms = brief.adPlatforms ?? [];

  const cta = brief.cta ?? { text: "Learn more", url: "https://ai-company.example/learn-more" };

  const children: PlannedSubIssue[] = [];

  // -------------------------- blog --------------------------
  children.push({
    kind: "blog",
    title: `Blog · ${campaign_id}`,
    suggested_skills: ["claude-blog", "claude-seo"],
    prompt: renderBlogPromptFromBrief(brief, brandVoice, targetAudience, cta),
    metadata: {
      target_word_count: brief.blogWordCount ?? DEFAULT_BLOG_WORD_COUNT,
    },
  });

  // -------------------------- social --------------------------
  for (const channel of socialChannels) {
    const count = socialCountForCampaignBrief(channel);
    children.push({
      kind: "social",
      title: `Social · ${channel} · ${campaign_id}`,
      suggested_skills: ["claude-blog"], // reuse for tone alignment; Buffer MCP handles publish
      prompt: renderSocialPromptFromBrief(brief, channel, count, brandVoice, targetAudience),
      metadata: { channel, count },
    });
  }

  // -------------------------- ads --------------------------
  if (adPlatforms.length === 0) {
    warnings.push("no ad platforms specified — skipping ads sub-issue");
  } else {
    const productPositioning =
      assets.product_info?.positioning ?? "product positioning unspecified";
    const complianceSummary = summarizeCompliance(assets.compliance_rules);
    for (const platform of adPlatforms) {
      children.push({
        kind: "ads",
        title: `Ads · ${platform} · ${campaign_id}`,
        suggested_skills: [], // AdCreative plugin handles copy; agent may add context
        prompt: renderAdsPromptFromBrief(
          brief,
          platform,
          brandVoice,
          productPositioning,
          targetAudience,
          complianceSummary,
        ),
        metadata: { platform, count: 3 },
      });
    }
  }

  return {
    campaign_id,
    parent_issue: {
      title: `Campaign · ${campaign_id}`,
      body: buildParentBody(brief, children),
    },
    children,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Helpers (kept in-file so prompt templates stay collocated with the plan)
// ---------------------------------------------------------------------------

function renderBlogPromptFromBrief(
  brief: CampaignBrief,
  brandVoice: BrandAssetPayloadMap["brand_voice"],
  targetAudience: BrandAssetPayloadMap["target_audience"],
  cta: { text: string; url: string },
): string {
  return renderBlogPrompt({
    brief: brief.brief,
    brandVoice,
    targetAudience,
    constraints: {
      target_word_count: brief.blogWordCount ?? DEFAULT_BLOG_WORD_COUNT,
      cta_text: cta.text,
      cta_url: cta.url,
    },
  });
}

function renderSocialPromptFromBrief(
  brief: CampaignBrief,
  channel: SocialChannel,
  count: number,
  brandVoice: BrandAssetPayloadMap["brand_voice"],
  targetAudience: BrandAssetPayloadMap["target_audience"],
): string {
  return renderSocialPrompt({
    brief: brief.brief,
    channel,
    count,
    brandVoice,
    targetAudience,
  });
}

function renderAdsPromptFromBrief(
  brief: CampaignBrief,
  platform: AdPlatform,
  brandVoice: BrandAssetPayloadMap["brand_voice"],
  productPositioning: string,
  targetAudience: BrandAssetPayloadMap["target_audience"],
  complianceSummary: string,
): string {
  return renderAdsPrompt({
    brief: brief.brief,
    platform,
    count: 3,
    brandVoice,
    productPositioning,
    targetAudience,
    complianceSummary,
  });
}

function summarizeCompliance(
  rules: BrandAssetPayloadMap["compliance_rules"] | undefined,
): string {
  if (!rules) return "No compliance rules specified.";
  const dos = rules.do_rules?.length
    ? `Do: ${rules.do_rules.join("; ")}`
    : "";
  const donts = rules.dont_rules?.length
    ? `Don't: ${rules.dont_rules.join("; ")}`
    : "";
  return [`Rule ${rules.rule_id} (${rules.category})`, dos, donts]
    .filter(Boolean)
    .join(" · ");
}

function buildParentBody(brief: CampaignBrief, children: PlannedSubIssue[]): string {
  const kinds = children.map((c) => `- ${c.kind}: ${c.title}`).join("\n");
  return [
    "## Brief",
    brief.brief,
    "",
    "## Planned children",
    kinds,
  ].join("\n");
}

function slugifyCampaign(brief: string): string {
  const slug = brief
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug.length > 0 ? `campaign-${slug}` : `campaign-untitled`;
}
