import { describe, expect, it } from "vitest";
import {
  BRAND_ASSET_SCOPES,
  ENTITY_TYPE,
  isBrandAssetScope,
  validateBrandAsset,
} from "./entities.js";

describe("entity_type / scopes", () => {
  it("declares canonical entity_type = 'brand_asset'", () => {
    expect(ENTITY_TYPE).toBe("brand_asset");
  });

  it("declares 8 Infobase-inspired scopes", () => {
    expect(BRAND_ASSET_SCOPES).toEqual([
      "brand_voice",
      "target_audience",
      "product_info",
      "competitor",
      "logo",
      "campaign_history",
      "kpi_targets",
      "compliance_rules",
    ]);
    expect(BRAND_ASSET_SCOPES).toHaveLength(8);
  });

  it("isBrandAssetScope narrows correctly", () => {
    expect(isBrandAssetScope("brand_voice")).toBe(true);
    expect(isBrandAssetScope("logo")).toBe(true);
    expect(isBrandAssetScope("random_scope")).toBe(false);
    expect(isBrandAssetScope(42)).toBe(false);
    expect(isBrandAssetScope(null)).toBe(false);
  });
});

describe("validateBrandAsset · happy paths", () => {
  it("accepts a minimal brand_voice payload", () => {
    const r = validateBrandAsset("brand_voice", {
      tone: "casual",
      vocabulary_do: ["hey", "let's"],
      vocabulary_dont: ["utilize"],
    });
    expect(r.ok).toBe(true);
  });

  it("accepts a minimal target_audience payload", () => {
    const r = validateBrandAsset("target_audience", {
      segment_name: "SMB founders",
      persona_summary: "First-time founder building an AI SaaS.",
      pain_points: ["fundraising"],
      goals: ["ship v1"],
    });
    expect(r.ok).toBe(true);
  });

  it("accepts a minimal product_info payload", () => {
    const r = validateBrandAsset("product_info", {
      product_name: "PaperClip",
      one_liner: "Managed AI-agent coworkers",
      key_features: [{ name: "hire", benefit: "spin up agents in seconds" }],
      positioning: "we are the ops layer for AI companies",
      category: "dev-tools",
    });
    expect(r.ok).toBe(true);
  });

  it("accepts a minimal logo payload", () => {
    const r = validateBrandAsset("logo", {
      primary_url: "https://cdn/logo.svg",
      usage_rules: ["min height 32px"],
      color_palette: [{ name: "brand", hex: "#0055ff", usage: "primary" }],
    });
    expect(r.ok).toBe(true);
  });

  it("accepts kpi_targets with valid period", () => {
    const r = validateBrandAsset("kpi_targets", {
      period: "month",
      targets: [{ metric: "signups", target_value: 100 }],
    });
    expect(r.ok).toBe(true);
  });

  it("accepts compliance_rules with valid category", () => {
    const r = validateBrandAsset("compliance_rules", {
      rule_id: "us-truth-in-advertising",
      category: "advertising",
      do_rules: ["disclose paid placement"],
      dont_rules: ["fake user testimonials"],
    });
    expect(r.ok).toBe(true);
  });
});

describe("validateBrandAsset · rejection paths", () => {
  it("rejects non-object data", () => {
    expect(validateBrandAsset("brand_voice", null).ok).toBe(false);
    expect(validateBrandAsset("brand_voice", "string").ok).toBe(false);
    expect(validateBrandAsset("brand_voice", []).ok).toBe(false);
  });

  it("rejects brand_voice missing tone", () => {
    const r = validateBrandAsset("brand_voice", {
      vocabulary_do: [],
      vocabulary_dont: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("brand_voice.tone");
  });

  it("rejects brand_voice with non-array vocabulary", () => {
    const r = validateBrandAsset("brand_voice", {
      tone: "casual",
      vocabulary_do: "not an array",
      vocabulary_dont: [],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects target_audience missing persona_summary", () => {
    const r = validateBrandAsset("target_audience", {
      segment_name: "SMB",
      pain_points: [],
      goals: [],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects kpi_targets with invalid period", () => {
    const r = validateBrandAsset("kpi_targets", {
      period: "decade",
      targets: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("period");
  });

  it("rejects compliance_rules with invalid category", () => {
    const r = validateBrandAsset("compliance_rules", {
      rule_id: "x",
      category: "not-a-real-category",
      do_rules: [],
      dont_rules: [],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects logo missing primary_url", () => {
    const r = validateBrandAsset("logo", {
      usage_rules: [],
      color_palette: [],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects logo with empty primary_url", () => {
    const r = validateBrandAsset("logo", {
      primary_url: "",
      usage_rules: [],
      color_palette: [],
    });
    expect(r.ok).toBe(false);
  });
});
