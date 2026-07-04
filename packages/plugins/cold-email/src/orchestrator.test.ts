import { describe, expect, it } from "vitest";
import { planSequence, type SequenceInput } from "./orchestrator.js";

const base: SequenceInput = {
  seed_list_id: "seed-2026-07",
  seed_recipients: ["a@example.com", "b@example.com", "c@example.com"],
  target_industry: "B2B-SaaS-dev",
  template_id: "onboarding-v1",
  sender_email: "hello@ai-company.com",
  channel: "draft-only",
  pacing: {
    max_per_day_per_domain: 50,
    warmup_target_sent: 50,
    warmup_deliverability_threshold: 0.8,
  },
};

describe("planSequence · default B2B-SaaS-dev + draft-only", () => {
  it("returns 6 planned steps", () => {
    const plan = planSequence(base);
    expect(plan.steps).toHaveLength(6);
  });

  it("draft-generation has no dependencies", () => {
    const plan = planSequence(base);
    const draft = plan.steps.find((s) => s.kind === "draft-generation");
    expect(draft?.depends_on).toEqual([]);
  });

  it("send-attempt depends on draft-generation", () => {
    const plan = planSequence(base);
    const send = plan.steps.find((s) => s.kind === "send-attempt");
    expect(send?.depends_on).toEqual(["draft-generation"]);
  });

  it("emits warning for draft-only channel (v0.1 降级)", () => {
    const plan = planSequence(base);
    expect(plan.warnings.some((w) => w.includes("draft-only"))).toBe(true);
  });

  it("shared_memory_scope has cold-email prefix", () => {
    const plan = planSequence(base);
    expect(plan.shared_memory_scope).toMatch(/^cold-email:/);
  });

  it("parent_issue title includes target_industry and template_id", () => {
    const plan = planSequence(base);
    expect(plan.parent_issue.title).toContain("B2B-SaaS-dev");
    expect(plan.parent_issue.title).toContain("onboarding-v1");
  });

  it("compliance_requirements include CAN-SPAM and GDPR mentions", () => {
    const plan = planSequence(base);
    const joined = plan.compliance_requirements.join(" ");
    expect(joined).toContain("CAN-SPAM");
    expect(joined).toContain("GDPR");
  });
});

describe("planSequence · zh-B2B", () => {
  const zhInput: SequenceInput = {
    ...base,
    target_industry: "zh-B2B",
    channel: "aliyun",
  };

  it("draft-generation suggests wewrite skill for Chinese", () => {
    const plan = planSequence(zhInput);
    const draft = plan.steps.find((s) => s.kind === "draft-generation");
    expect(draft?.suggested_skills).toContain("wewrite");
  });

  it("compliance mentions PIPL", () => {
    const plan = planSequence(zhInput);
    const joined = plan.compliance_requirements.join(" ");
    expect(joined).toContain("PIPL");
  });

  it("emits warning when zh-B2B uses non-aliyun/tencent channel", () => {
    const plan = planSequence({ ...zhInput, channel: "sendgrid" });
    expect(
      plan.warnings.some((w) => w.includes("阿里云") || w.includes("腾讯")),
    ).toBe(true);
  });
});

describe("planSequence · generic", () => {
  const genericInput: SequenceInput = { ...base, target_industry: "generic" };

  it("compliance uses custom regime dispatch", () => {
    const plan = planSequence(genericInput);
    const joined = plan.compliance_requirements.join(" ");
    expect(joined).toContain("custom");
  });
});

describe("planSequence · seed size warnings", () => {
  it("warns when seed size exceeds 200", () => {
    const large = Array.from({ length: 250 }, (_, i) => `u${i}@example.com`);
    const plan = planSequence({ ...base, seed_recipients: large });
    expect(plan.warnings.some((w) => w.includes("seed size 250"))).toBe(true);
  });

  it("no seed size warning at 200 or below", () => {
    const okSize = Array.from({ length: 200 }, (_, i) => `u${i}@example.com`);
    const plan = planSequence({ ...base, seed_recipients: okSize });
    expect(plan.warnings.some((w) => w.includes("seed size"))).toBe(false);
  });
});

describe("planSequence · pacing warnings", () => {
  it("warns when max_per_day_per_domain > 50", () => {
    const plan = planSequence({
      ...base,
      pacing: { ...base.pacing, max_per_day_per_domain: 100 },
    });
    expect(
      plan.warnings.some((w) => w.includes("deliverability risk")),
    ).toBe(true);
  });
});

describe("planSequence · sequence_id normalization", () => {
  it("derives id from seed_list + template if not provided", () => {
    const plan = planSequence(base);
    expect(plan.sequence_id).toMatch(/^coldemail-/);
    expect(plan.sequence_id).toContain("seed-2026-07");
  });

  it("respects explicit sequence_id", () => {
    const plan = planSequence({ ...base, sequence_id: "my-custom-id" });
    expect(plan.sequence_id).toBe("my-custom-id");
  });

  it("truncates long slugs", () => {
    const plan = planSequence({
      ...base,
      seed_list_id: "very-long-seed-list-identifier-that-goes-on-and-on-more",
    });
    expect(plan.sequence_id.length).toBeLessThanOrEqual(50);
  });
});

describe("planSequence · determinism (Pattern-4)", () => {
  it("same input produces byte-identical plan JSON", () => {
    const a = JSON.stringify(planSequence(base));
    const b = JSON.stringify(planSequence(base));
    expect(a).toBe(b);
  });
});
