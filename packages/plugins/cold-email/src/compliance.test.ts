import { describe, expect, it } from "vitest";
import {
  piplFirstContactDisclosure,
  preSendCheck,
  regimesFor,
  shouldPurge,
  unsubscribeToken,
  withinFrequencyLimit,
  type ComplianceContext,
  type Recipient,
} from "./compliance.js";

describe("regimesFor", () => {
  it("B2B-SaaS-dev activates gdpr + can-spam", () => {
    expect(regimesFor("B2B-SaaS-dev")).toEqual(["gdpr", "can-spam"]);
  });

  it("zh-B2B activates pipl only", () => {
    expect(regimesFor("zh-B2B")).toEqual(["pipl"]);
  });

  it("generic activates custom regime", () => {
    expect(regimesFor("generic")).toEqual(["custom"]);
  });
});

const baseCtx: ComplianceContext = {
  industry: "B2B-SaaS-dev",
  sender_physical_address: "123 Main St · SF",
  retention_days: 1095,
};

const cleanRecipient = (over: Partial<Recipient> = {}): Recipient => ({
  email: "user@example.com",
  opt_in_record: {
    source_url: "https://example.com/signup",
    opted_in_at: "2026-01-01T00:00:00Z",
  },
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

describe("preSendCheck · GDPR + CAN-SPAM (A dispatch)", () => {
  it("passes with opt-in and physical address", () => {
    const r = preSendCheck(cleanRecipient(), baseCtx);
    expect(r.ok).toBe(true);
    expect(r.regime_violations).toEqual([]);
  });

  it("fails without opt-in and no business_justification", () => {
    const r = preSendCheck(cleanRecipient({ opt_in_record: undefined }), baseCtx);
    expect(r.ok).toBe(false);
    expect(r.regime_violations.some((v) => v.regime === "gdpr")).toBe(true);
  });

  it("passes with business_justification instead of opt-in (GDPR legitimate interest)", () => {
    const r = preSendCheck(
      cleanRecipient({
        opt_in_record: undefined,
        business_justification: {
          kind: "existing_customer",
          since: "2024-06-01",
          reference: "contract-123",
        },
      }),
      baseCtx,
    );
    // GDPR passes with business_justification, CAN-SPAM only needs physical addr
    expect(r.ok).toBe(true);
  });

  it("fails without sender_physical_address (CAN-SPAM)", () => {
    const r = preSendCheck(cleanRecipient(), {
      ...baseCtx,
      sender_physical_address: undefined,
    });
    expect(r.ok).toBe(false);
    expect(r.regime_violations.some((v) => v.regime === "can-spam")).toBe(true);
  });

  it("universal opt-out overrides everything (unsubscribed=true)", () => {
    const r = preSendCheck(
      cleanRecipient({ unsubscribed: true, unsubscribed_at: "2026-06-01" }),
      baseCtx,
    );
    expect(r.ok).toBe(false);
    expect(r.regime_violations.length).toBeGreaterThan(0);
  });
});

describe("preSendCheck · PIPL (B dispatch)", () => {
  const piplCtx: ComplianceContext = { industry: "zh-B2B", retention_days: 1095 };

  it("passes with opt-in for CN recipient", () => {
    const r = preSendCheck(cleanRecipient({ country: "CN" }), piplCtx);
    expect(r.ok).toBe(true);
  });

  it("fails without opt-in even with business_justification (PIPL stricter)", () => {
    const r = preSendCheck(
      cleanRecipient({
        opt_in_record: undefined,
        business_justification: {
          kind: "existing_customer",
          since: "2024-06-01",
        },
      }),
      piplCtx,
    );
    expect(r.ok).toBe(false);
    expect(
      r.regime_violations.some(
        (v) => v.regime === "pipl" && v.reason.includes("opt-in required"),
      ),
    ).toBe(true);
  });

  it("fails on cross-border transfer without separate consent", () => {
    const r = preSendCheck(cleanRecipient({ country: "US" }), piplCtx);
    expect(r.ok).toBe(false);
    expect(
      r.regime_violations.some((v) => v.regime === "pipl" && v.reason.includes("Art 38")),
    ).toBe(true);
  });
});

describe("preSendCheck · generic (C dispatch)", () => {
  const genericCtx: ComplianceContext = { industry: "generic", retention_days: 1095 };

  it("passes minimal recipient (user takes responsibility)", () => {
    const r = preSendCheck(cleanRecipient({ opt_in_record: undefined }), genericCtx);
    expect(r.ok).toBe(true);
  });

  it("still respects universal opt-out", () => {
    const r = preSendCheck(cleanRecipient({ unsubscribed: true }), genericCtx);
    expect(r.ok).toBe(false);
  });
});

describe("shouldPurge · retention audit", () => {
  const ctx: ComplianceContext = {
    industry: "B2B-SaaS-dev",
    retention_days: 1095,
    now: new Date("2029-01-02T00:00:00Z"), // >3y after created_at
  };

  it("purges records older than retention", () => {
    const r = cleanRecipient({ created_at: "2026-01-01T00:00:00Z" });
    expect(shouldPurge(r, ctx)).toBe(true);
  });

  it("retains records within retention window", () => {
    const r = cleanRecipient({ created_at: "2028-01-01T00:00:00Z" });
    expect(shouldPurge(r, ctx)).toBe(false);
  });
});

describe("withinFrequencyLimit", () => {
  const limits = { max_per_day_per_domain: 50, max_per_hour: 5 };

  it("passes under both limits", () => {
    expect(
      withinFrequencyLimit(
        { domain_sent_today: 10, domain_sent_this_hour: 2 },
        limits,
      ),
    ).toBe(true);
  });

  it("fails when daily cap reached", () => {
    expect(
      withinFrequencyLimit(
        { domain_sent_today: 50, domain_sent_this_hour: 0 },
        limits,
      ),
    ).toBe(false);
  });

  it("fails when hourly cap reached", () => {
    expect(
      withinFrequencyLimit(
        { domain_sent_today: 5, domain_sent_this_hour: 5 },
        limits,
      ),
    ).toBe(false);
  });
});

describe("unsubscribeToken", () => {
  it("produces deterministic token for the same input", () => {
    const t1 = unsubscribeToken("user@example.com", "secret");
    const t2 = unsubscribeToken("user@example.com", "secret");
    expect(t1).toBe(t2);
    expect(t1).toMatch(/^unsub_/);
  });

  it("differs for different emails", () => {
    const t1 = unsubscribeToken("a@example.com", "secret");
    const t2 = unsubscribeToken("b@example.com", "secret");
    expect(t1).not.toBe(t2);
  });

  it("differs for different secrets", () => {
    const t1 = unsubscribeToken("user@example.com", "s1");
    const t2 = unsubscribeToken("user@example.com", "s2");
    expect(t1).not.toBe(t2);
  });
});

describe("piplFirstContactDisclosure", () => {
  it("includes recipient email in disclosure", () => {
    const d = piplFirstContactDisclosure(cleanRecipient({ email: "abc@qq.com" }));
    expect(d).toContain("abc@qq.com");
    expect(d).toContain("数据来源");
    expect(d).toContain("退订");
  });
});
