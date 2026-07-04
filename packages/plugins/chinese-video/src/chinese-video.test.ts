import { describe, expect, it } from "vitest";
import { planPiece, type PieceInput } from "./orchestrator.js";
import { dispatchWebhook } from "./worker.js";

const base: PieceInput = {
  topic: "AI 公司如何自主运营",
  target_platform: "weixin-video",
  content_type: "short-video",
  tone_preset: "professional-hardcore",
};

describe("planPiece · default weixin-video short-video", () => {
  it("returns 3 steps for video content", () => {
    const plan = planPiece(base);
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps.map((s) => s.kind)).toEqual([
      "content-adaptation",
      "video-synth",
      "platform-post",
    ]);
  });

  it("piece_id includes platform and topic slug", () => {
    const plan = planPiece(base);
    expect(plan.piece_id).toContain("weixin-video");
  });

  it("shared_memory_scope has chinese-video prefix", () => {
    const plan = planPiece(base);
    expect(plan.shared_memory_scope).toMatch(/^chinese-video:/);
  });
});

describe("planPiece · image-text skips synth step", () => {
  it("has 2 steps · content-adaptation + platform-post", () => {
    const plan = planPiece({ ...base, content_type: "image-text" });
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps.map((s) => s.kind)).toEqual([
      "content-adaptation",
      "platform-post",
    ]);
  });
});

describe("planPiece · platform-specific warnings", () => {
  it("warns on douyin long-video mismatch", () => {
    const plan = planPiece({
      ...base,
      target_platform: "douyin",
      content_type: "long-video",
    });
    expect(plan.warnings.some((w) => w.includes("douyin"))).toBe(true);
  });

  it("warns on bilibili short-video mismatch", () => {
    const plan = planPiece({
      ...base,
      target_platform: "bilibili",
      content_type: "short-video",
    });
    expect(plan.warnings.some((w) => w.includes("bilibili"))).toBe(true);
  });

  it("warns on weixin-video without CTA", () => {
    const plan = planPiece(base);
    expect(plan.warnings.some((w) => w.includes("CTA"))).toBe(true);
  });

  it("no CTA warning when CTA supplied", () => {
    const plan = planPiece({ ...base, cta_type: "signup" });
    expect(plan.warnings.some((w) => w.includes("CTA"))).toBe(false);
  });
});

describe("planPiece · determinism", () => {
  it("identical inputs yield identical plans", () => {
    const a = JSON.stringify(planPiece(base));
    const b = JSON.stringify(planPiece(base));
    expect(a).toBe(b);
  });
});

describe("dispatchWebhook · create-piece", () => {
  it("returns 202 with plan summary", () => {
    const res = dispatchWebhook({ endpointKey: "create-piece", body: base });
    expect(res.status).toBe(202);
    const body = res.body as { piece_id: string; steps_count: number };
    expect(body.piece_id).toBeTypeOf("string");
    expect(body.steps_count).toBeGreaterThan(0);
  });

  it("returns 400 for missing fields", () => {
    const res = dispatchWebhook({
      endpointKey: "create-piece",
      body: { topic: "x" },
    });
    expect(res.status).toBe(400);
  });
});

describe("dispatchWebhook · publish-piece (scaffold)", () => {
  it("returns 202 with scaffold note", () => {
    const res = dispatchWebhook({
      endpointKey: "publish-piece",
      body: { piece_id: "p1", platform: "weixin-video" },
    });
    expect(res.status).toBe(202);
    const body = res.body as { note: string };
    expect(body.note).toContain("scaffold");
  });

  it("returns 400 when missing platform", () => {
    const res = dispatchWebhook({
      endpointKey: "publish-piece",
      body: { piece_id: "p1" },
    });
    expect(res.status).toBe(400);
  });
});

describe("dispatchWebhook · unknown endpoint", () => {
  it("returns 404", () => {
    const res = dispatchWebhook({ endpointKey: "wat" });
    expect(res.status).toBe(404);
  });
});
