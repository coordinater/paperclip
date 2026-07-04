/**
 * Cold-email compliance module · M4-02 MVP · handles GDPR / CAN-SPAM / PIPL.
 *
 * Pattern-12 · 三合规矩阵 · C8 middleware 分支激活 · D-M4-08.
 * retention 3 年 = GDPR 6 年 ∩ PIPL 3 年 (取交集 · 最严)
 *
 * Pure functions · no I/O · deterministic.
 */

export type TargetIndustry = "B2B-SaaS-dev" | "zh-B2B" | "generic";

export type ComplianceRegime =
  | "gdpr"           // EU
  | "can-spam"       // US
  | "pipl"           // China
  | "custom";        // C generic dispatch

/**
 * Returns the compliance regimes activated for a given target_industry.
 */
export function regimesFor(industry: TargetIndustry): ComplianceRegime[] {
  switch (industry) {
    case "B2B-SaaS-dev":
      return ["gdpr", "can-spam"]; // global B2B likely spans EU + US
    case "zh-B2B":
      return ["pipl"]; // Chinese domestic
    case "generic":
      return ["custom"]; // user-defined per-recipient
    default:
      return ["gdpr", "can-spam", "pipl"]; // conservative fallback = 全并集
  }
}

export interface Recipient {
  email: string;
  opt_in_record?: {
    /** URL evidence of opt-in (e.g. form submission) · GDPR 5.1(a) */
    source_url: string;
    /** ISO 8601 UTC timestamp */
    opted_in_at: string;
  };
  business_justification?: {
    /** e.g. "existing customer since 2024-01-01" · CAN-SPAM commercial relationship exception */
    kind: "existing_customer" | "contract" | "prior_purchase";
    since: string; // ISO date
    reference?: string; // contract id / invoice #
  };
  unsubscribed?: boolean;
  unsubscribed_at?: string;
  /** Country code · used for PIPL geo-check */
  country?: string;
  /** For PIPL Art 47 retention check · created ISO timestamp */
  created_at: string;
}

export interface ComplianceContext {
  industry: TargetIndustry;
  sender_physical_address?: string; // CAN-SPAM §5(a)(5)
  retention_days: number;           // GDPR 6y ∩ PIPL 3y = 3y = 1095
  now?: Date;                        // For deterministic testing
}

export interface ComplianceCheckResult {
  ok: boolean;
  regime_violations: Array<{ regime: ComplianceRegime; reason: string }>;
}

/**
 * Pre-send check · called before每封 email 出站.
 * Runs all activated regime checks · aggregates violations.
 */
export function preSendCheck(
  recipient: Recipient,
  ctx: ComplianceContext,
): ComplianceCheckResult {
  const regimes = regimesFor(ctx.industry);
  const violations: Array<{ regime: ComplianceRegime; reason: string }> = [];

  // Universal: unsubscribed recipients never get more mail
  if (recipient.unsubscribed) {
    return {
      ok: false,
      regime_violations: regimes.map((r) => ({
        regime: r,
        reason: "recipient has unsubscribed · universal opt-out",
      })),
    };
  }

  // Opt-in or business-justification check (GDPR / PIPL)
  const hasOptIn = !!recipient.opt_in_record;
  const hasBusinessJust = !!recipient.business_justification;

  for (const regime of regimes) {
    switch (regime) {
      case "gdpr": {
        // GDPR requires opt-in OR legitimate interest · we treat business_justification as legitimate interest signal
        if (!hasOptIn && !hasBusinessJust) {
          violations.push({
            regime,
            reason: "GDPR Art 6.1 · no opt-in and no business justification",
          });
        }
        break;
      }
      case "can-spam": {
        // CAN-SPAM allows unsolicited commercial if unsubscribe link + physical address are present.
        // But we require sender_physical_address at context level (§5(a)(5)).
        if (!ctx.sender_physical_address) {
          violations.push({
            regime,
            reason: "CAN-SPAM §5(a)(5) · sender_physical_address required in ctx",
          });
        }
        break;
      }
      case "pipl": {
        // PIPL is opt-in strict · business_justification NOT sufficient (unlike GDPR legitimate interest)
        if (!hasOptIn) {
          violations.push({
            regime,
            reason: "PIPL Art 13 · opt-in required · business_justification insufficient",
          });
        }
        // PIPL Art 38 · cross-border transfer requires explicit consent
        if (recipient.country && recipient.country !== "CN") {
          violations.push({
            regime,
            reason: `PIPL Art 38 · cross-border transfer to ${recipient.country} requires separate consent`,
          });
        }
        break;
      }
      case "custom": {
        // Generic dispatch · user-defined per-recipient compliance metadata
        // Minimal check: unsubscribe link + retention window
        // No auto-violation · assume user has arranged their own compliance
        break;
      }
    }
  }

  return { ok: violations.length === 0, regime_violations: violations };
}

/**
 * Retention audit · returns true if recipient should be purged.
 * Called by compliance-audit routine weekly.
 */
export function shouldPurge(recipient: Recipient, ctx: ComplianceContext): boolean {
  const now = ctx.now ?? new Date();
  const created = new Date(recipient.created_at);
  const ageMs = now.getTime() - created.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays > ctx.retention_days;
}

/**
 * Frequency limit check · called before scheduling send batch.
 * Returns true if the recipient's domain is within cap.
 */
export interface FrequencyState {
  domain_sent_today: number;
  domain_sent_this_hour: number;
}

export function withinFrequencyLimit(
  state: FrequencyState,
  limits: { max_per_day_per_domain: number; max_per_hour: number },
): boolean {
  return (
    state.domain_sent_today < limits.max_per_day_per_domain &&
    state.domain_sent_this_hour < limits.max_per_hour
  );
}

/**
 * Generate unsubscribe token · HMAC-based · idempotent per recipient.
 * For MVP · returns simple deterministic string · production replaces with crypto.subtle HMAC.
 * TODO(team-verify): move to crypto.subtle HMAC once secret provisioning path is chosen.
 */
export function unsubscribeToken(email: string, secret: string): string {
  // Deterministic non-crypto for MVP · placeholder
  // Replace with real HMAC-SHA256 in production
  const combined = `${email}:${secret}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash * 31 + combined.charCodeAt(i)) | 0;
  }
  return `unsub_${Math.abs(hash).toString(36)}`;
}

/**
 * PIPL disclosure for Chinese first-contact emails · Art 13.
 * Returns disclosure prefix that must be prepended.
 */
export function piplFirstContactDisclosure(recipient: Recipient): string {
  return `[数据来源说明] 您收到本邮件是因为您在公开平台留下了联系方式 (${recipient.email})。如不希望继续接收 · 请点击底部退订链接。`;
}
