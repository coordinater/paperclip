import { describe, expect, it, vi } from "vitest";
import { onWebhook, parseCampaignBrief } from "./worker.js";
import type { CampaignWorkflowCtx } from "./worker.js";

describe("parseCampaignBrief", () => {
  it("accepts a valid minimal body", () => {
    const r = parseCampaignBrief({ brief: "launch v1" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.brief).toBe("launch v1");
  });

  it("rejects non-object body", () => {
    expect(parseCampaignBrief(null).ok).toBe(false);
    expect(parseCampaignBrief("string").ok).toBe(false);
    expect(parseCampaignBrief([]).ok).toBe(false);
  });

  it("rejects empty brief", () => {
    expect(parseCampaignBrief({ brief: "" }).ok).toBe(false);
    expect(parseCampaignBrief({ brief: "   " }).ok).toBe(false);
  });

  it("rejects brief > 4000 chars", () => {
    const long = "x".repeat(4001);
    expect(parseCampaignBrief({ brief: long }).ok).toBe(false);
  });

  it("accepts valid socialChannels + adPlatforms", () => {
    const r = parseCampaignBrief({
      brief: "launch",
      socialChannels: ["twitter", "linkedin"],
      adPlatforms: ["meta", "tiktok"],
    });
    expect(r.ok).toBe(true);
  });

  it("rejects unknown channels", () => {
    const r = parseCampaignBrief({
      brief: "launch",
      socialChannels: ["not-a-channel"],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects unknown ad platforms", () => {
    const r = parseCampaignBrief({
      brief: "launch",
      adPlatforms: ["invalid"],
    });
    expect(r.ok).toBe(false);
  });

  it("validates blogWordCount range", () => {
    expect(parseCampaignBrief({ brief: "x", blogWordCount: -5 }).ok).toBe(false);
    expect(parseCampaignBrief({ brief: "x", blogWordCount: 999999 }).ok).toBe(false);
    expect(parseCampaignBrief({ brief: "x", blogWordCount: 500 }).ok).toBe(true);
  });

  it("validates cta shape", () => {
    expect(parseCampaignBrief({ brief: "x", cta: "not-object" }).ok).toBe(false);
    expect(parseCampaignBrief({ brief: "x", cta: { text: "x" } }).ok).toBe(false);
    expect(
      parseCampaignBrief({ brief: "x", cta: { text: "Sign up", url: "https://x" } }).ok,
    ).toBe(true);
  });

  it("preserves campaignId when non-empty", () => {
    const r = parseCampaignBrief({ brief: "x", campaignId: "spring-launch" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.campaignId).toBe("spring-launch");
  });
});

describe("onWebhook · endpoint dispatch", () => {
  const ctx: CampaignWorkflowCtx = {};

  it("returns 404 for unknown endpoints", async () => {
    const r = await onWebhook({ endpointKey: "does-not-exist" }, ctx);
    expect(r.status).toBe(404);
  });

  it("returns 405 for submit-brief non-POST", async () => {
    const r = await onWebhook(
      { endpointKey: "submit-brief", method: "GET", body: { brief: "x" } },
      ctx,
    );
    expect(r.status).toBe(405);
  });

  it("returns 400 for invalid submit-brief body", async () => {
    const r = await onWebhook(
      { endpointKey: "submit-brief", method: "POST", body: {} },
      ctx,
    );
    expect(r.status).toBe(400);
  });

  it("returns 200 + plan for valid submit-brief", async () => {
    const logActivity = vi.fn(async () => {});
    const fetchBrandAssets = vi.fn(async () => ({
      brand_voice: {
        tone: "casual",
        vocabulary_do: [],
        vocabulary_dont: [],
      },
    }));

    const r = await onWebhook(
      {
        endpointKey: "submit-brief",
        method: "POST",
        body: {
          brief: "Launch v1 to indie hackers",
          socialChannels: ["twitter"],
          adPlatforms: ["meta"],
        },
      },
      { logActivity, fetchBrandAssets },
    );
    expect(r.status).toBe(200);
    const plan = r.body as { campaign_id: string; children: unknown[] };
    expect(plan.campaign_id).toContain("campaign-");
    expect(plan.children.length).toBeGreaterThan(0);
    expect(fetchBrandAssets).toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalledWith("campaign_planned", expect.any(Object));
  });

  it("works even when fetchBrandAssets isn't provided (uses defaults + warnings)", async () => {
    const r = await onWebhook(
      {
        endpointKey: "submit-brief",
        method: "POST",
        body: { brief: "launch v1" },
      },
      {},
    );
    expect(r.status).toBe(200);
    const plan = r.body as { warnings: string[] };
    expect(plan.warnings).toContain("no brand_voice asset — using neutral defaults");
  });
});

describe("onWebhook · campaign-status", () => {
  it("returns 400 without campaign_id", async () => {
    const r = await onWebhook({ endpointKey: "campaign-status" }, {});
    expect(r.status).toBe(400);
  });

  it("returns 501 when readCampaignState not wired", async () => {
    const r = await onWebhook(
      { endpointKey: "campaign-status", query: { campaign_id: "x" } },
      {},
    );
    expect(r.status).toBe(501);
  });

  it("returns 404 when readCampaignState returns null", async () => {
    const r = await onWebhook(
      { endpointKey: "campaign-status", query: { campaign_id: "missing" } },
      { readCampaignState: async () => null },
    );
    expect(r.status).toBe(404);
  });

  it("returns 200 + state when readCampaignState resolves", async () => {
    const r = await onWebhook(
      { endpointKey: "campaign-status", query: { campaign_id: "campaign-x" } },
      {
        readCampaignState: async (id) => ({
          campaign_id: id,
          status: "in_progress",
          updated_at: "2026-07-03T00:00:00Z",
        }),
      },
    );
    expect(r.status).toBe(200);
    const body = r.body as { campaign_id: string; status: string };
    expect(body.campaign_id).toBe("campaign-x");
    expect(body.status).toBe("in_progress");
  });

  it("reads campaign_id from body if query missing", async () => {
    const r = await onWebhook(
      {
        endpointKey: "campaign-status",
        method: "POST",
        body: { campaign_id: "campaign-y" },
      },
      { readCampaignState: async (id) => ({ campaign_id: id, status: "planned", updated_at: "..." }) },
    );
    expect(r.status).toBe(200);
  });
});
