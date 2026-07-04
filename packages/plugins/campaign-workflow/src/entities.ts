/**
 * Campaign Workflow · Infobase-inspired 8-scope entity design (M2 W7-D2).
 *
 * 抄 Infobase 参考架构（closed-source SaaS · 但公开的 "8-scope entity" 设计模式）。
 * 手册 §W7.D2 要求 plugin_entities(entity_type='brand_asset') + plugin_state 分工.
 *
 * 分工原则（per handoff/06-规范.md §2.1）：
 *   - plugin_entities  ← 结构化、schema 明确、可查询的品牌资产
 *   - plugin_state     ← 半结构化 / 高变化率 / kv-style 的中间状态
 *
 * 8 个 scope 是 Infobase 的公开设计模式 —— 覆盖营销侧几乎所有"agent 需要知道的品牌事实"。
 */

/**
 * Canonical entity_type discriminator for the plugin_entities row.
 * All campaign-workflow brand assets share this type; individual scopes
 * distinguish via the `scope` column.
 */
export const ENTITY_TYPE = "brand_asset";

/**
 * 8-scope enum. Extend this by adding a new BrandAssetScope entry and its
 * schema in the map below. All 8 are Infobase-inspired canonical scopes.
 */
export const BRAND_ASSET_SCOPES = [
  "brand_voice",
  "target_audience",
  "product_info",
  "competitor",
  "logo",
  "campaign_history",
  "kpi_targets",
  "compliance_rules",
] as const;

export type BrandAssetScope = (typeof BRAND_ASSET_SCOPES)[number];

/**
 * Per-scope schema. Each schema defines the shape of a single row's `data`
 * blob. Keep schemas conservative (add fields, don't rename) — plugin_entities
 * data is JSON, so consumers rely on field stability.
 */

export interface BrandVoicePayload {
  tone: string; // "casual" | "professional" | "playful" | ...
  vocabulary_do: string[]; // words to prefer
  vocabulary_dont: string[]; // words to avoid (compliance / off-brand)
  reading_level?: "elementary" | "middle" | "high" | "college" | "professional";
  sample_paragraphs?: string[]; // few-shot examples for LLM prompts
}

export interface TargetAudiencePayload {
  segment_name: string;
  persona_summary: string; // 1-paragraph persona
  demographics?: {
    age_range?: [number, number];
    geography?: string[];
    industry?: string[];
  };
  pain_points: string[];
  goals: string[];
  preferred_channels?: string[]; // "email" | "linkedin" | "instagram" | ...
}

export interface ProductInfoPayload {
  product_name: string;
  one_liner: string;
  key_features: Array<{ name: string; benefit: string }>;
  pricing_summary?: string;
  positioning: string; // "we are X for people who Y"
  category: string;
}

export interface CompetitorPayload {
  name: string;
  url?: string;
  positioning: string;
  strengths: string[];
  weaknesses: string[];
  differentiation_hooks: string[]; // "we beat them at X because Y"
}

export interface LogoPayload {
  primary_url: string; // canonical logo file
  variants?: {
    dark_bg?: string;
    light_bg?: string;
    monochrome?: string;
    square?: string;
    horizontal?: string;
  };
  usage_rules: string[]; // "min height 32px" / "always include clearspace"
  color_palette: Array<{ name: string; hex: string; usage: string }>;
}

export interface CampaignHistoryPayload {
  campaign_id: string; // links back to campaign parent issue
  brief_summary: string;
  channels: string[];
  outputs: Array<{ kind: "blog" | "social" | "ads" | "email"; ref: string }>;
  performance?: {
    ran_at: string; // ISO 8601
    impressions?: number;
    clicks?: number;
    conversions?: number;
    lessons_learned?: string[];
  };
}

export interface KpiTargetsPayload {
  period: "week" | "month" | "quarter" | "year";
  targets: Array<{
    metric: string; // "signups" | "MRR" | "trial_conversions"
    target_value: number;
    unit?: string; // "USD" | "count"
  }>;
  guardrails?: Array<{
    metric: string;
    max_or_min: "max" | "min";
    value: number;
    reason: string;
  }>;
}

export interface ComplianceRulesPayload {
  rule_id: string;
  jurisdiction?: string; // "us-gdpr" | "eu-gdpr" | "cn-cac"
  category: "content" | "data" | "advertising" | "financial";
  do_rules: string[];
  dont_rules: string[];
  effective_date?: string; // ISO 8601
}

/**
 * Payload discriminated union — use with a `switch (scope)` to get exact types.
 * Consumers do:
 *   const asset = getBrandAsset(companyId, "brand_voice");
 *   // asset.scope === "brand_voice", asset.data has BrandVoicePayload shape
 */
export type BrandAssetPayloadMap = {
  brand_voice: BrandVoicePayload;
  target_audience: TargetAudiencePayload;
  product_info: ProductInfoPayload;
  competitor: CompetitorPayload;
  logo: LogoPayload;
  campaign_history: CampaignHistoryPayload;
  kpi_targets: KpiTargetsPayload;
  compliance_rules: ComplianceRulesPayload;
};

export type BrandAsset<Scope extends BrandAssetScope = BrandAssetScope> = {
  scope: Scope;
  data: BrandAssetPayloadMap[Scope];
};

// ---------------------------------------------------------------------------
// Validation helpers (used by manifest + storage layer)
// ---------------------------------------------------------------------------

export function isBrandAssetScope(value: unknown): value is BrandAssetScope {
  return typeof value === "string" && (BRAND_ASSET_SCOPES as readonly string[]).includes(value);
}

/**
 * Validate a raw JSON blob against a scope's expected shape. Returns typed
 * BrandAsset on success or an error message. Kept minimal — full JSON schema
 * validation lives at the API boundary if we ever add one; this is enough to
 * catch obvious shape mismatches at storage time.
 */
export function validateBrandAsset(
  scope: BrandAssetScope,
  data: unknown,
): { ok: true; asset: BrandAsset } | { ok: false; error: string } {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: `data must be an object for scope ${scope}` };
  }
  const d = data as Record<string, unknown>;

  switch (scope) {
    case "brand_voice":
      if (typeof d.tone !== "string" || d.tone.length === 0) {
        return { ok: false, error: "brand_voice.tone required" };
      }
      if (!Array.isArray(d.vocabulary_do) || !Array.isArray(d.vocabulary_dont)) {
        return { ok: false, error: "brand_voice.vocabulary_do/dont must be arrays" };
      }
      break;
    case "target_audience":
      if (typeof d.segment_name !== "string" || typeof d.persona_summary !== "string") {
        return { ok: false, error: "target_audience.segment_name + persona_summary required" };
      }
      if (!Array.isArray(d.pain_points) || !Array.isArray(d.goals)) {
        return { ok: false, error: "target_audience.pain_points + goals must be arrays" };
      }
      break;
    case "product_info":
      if (typeof d.product_name !== "string" || typeof d.one_liner !== "string") {
        return { ok: false, error: "product_info.product_name + one_liner required" };
      }
      if (!Array.isArray(d.key_features)) {
        return { ok: false, error: "product_info.key_features must be array" };
      }
      break;
    case "competitor":
      if (typeof d.name !== "string") return { ok: false, error: "competitor.name required" };
      break;
    case "logo":
      if (typeof d.primary_url !== "string" || d.primary_url.length === 0) {
        return { ok: false, error: "logo.primary_url required" };
      }
      if (!Array.isArray(d.usage_rules) || !Array.isArray(d.color_palette)) {
        return { ok: false, error: "logo.usage_rules + color_palette must be arrays" };
      }
      break;
    case "campaign_history":
      if (typeof d.campaign_id !== "string") {
        return { ok: false, error: "campaign_history.campaign_id required" };
      }
      break;
    case "kpi_targets":
      if (!["week", "month", "quarter", "year"].includes(String(d.period))) {
        return { ok: false, error: "kpi_targets.period must be week|month|quarter|year" };
      }
      if (!Array.isArray(d.targets)) {
        return { ok: false, error: "kpi_targets.targets must be array" };
      }
      break;
    case "compliance_rules":
      if (typeof d.rule_id !== "string") {
        return { ok: false, error: "compliance_rules.rule_id required" };
      }
      if (!["content", "data", "advertising", "financial"].includes(String(d.category))) {
        return { ok: false, error: "compliance_rules.category must be content|data|advertising|financial" };
      }
      break;
  }

  return {
    ok: true,
    asset: { scope, data: data as BrandAsset["data"] } as BrandAsset,
  };
}
