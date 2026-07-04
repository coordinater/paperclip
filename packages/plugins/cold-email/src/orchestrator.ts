/**
 * Cold-email sequence orchestrator · M4-02 MVP.
 *
 * Pattern-4 · pure function planSequence(input) → SequencePlan.
 * No I/O · no time · no random · fully testable.
 */

import type { TargetIndustry } from "./compliance.js";

export type EmailChannel =
  | "draft-only"      // v0.1 default · D-M4-07 · no real send
  | "sendgrid"
  | "ses"
  | "aliyun"          // for zh-B2B分支
  | "tencent"
  | "smtp";

export interface SequenceInput {
  seed_list_id: string;
  seed_recipients: string[]; // email list (limited size for v0.1)
  target_industry: TargetIndustry;
  template_id: string;
  sender_email: string;
  channel: EmailChannel;
  pacing: {
    max_per_day_per_domain: number;
    warmup_target_sent: number;
    warmup_deliverability_threshold: number;
  };
  /** Optional sequence id override (defaults to slug). */
  sequence_id?: string;
}

export type StepKind =
  | "draft-generation"
  | "send-attempt"
  | "reply-handle"
  | "bounce-handle"
  | "unsubscribe-handle"
  | "compliance-audit-log";

export interface PlannedStep {
  kind: StepKind;
  title: string;
  body: string;
  depends_on: StepKind[];
  suggested_adapter: string;
  suggested_skills: string[];
}

export interface SequencePlan {
  sequence_id: string;
  parent_issue: { title: string; body: string };
  steps: PlannedStep[];
  shared_memory_scope: string; // cold-email:{sequence_id}
  compliance_requirements: string[];
  warnings: string[];
}

const DRAFT_ADAPTER = "claude_local";
const DRAFT_ROLE = "content-marketer";

const CHINESE_INDUSTRY_ADAPTER = "claude_local";
const CHINESE_INDUSTRY_MODEL_HINT = "volcengine_ark";

/**
 * Plan a cold-email sequence for a single brief.
 * Deterministic · called by worker.ts on create-sequence webhook.
 */
export function planSequence(input: SequenceInput): SequencePlan {
  const sequence_id = normalizeSequenceId(input);
  const warnings: string[] = [];

  // Compliance regime → warnings
  if (input.target_industry === "zh-B2B" && input.channel !== "aliyun" && input.channel !== "tencent") {
    warnings.push(
      "zh-B2B industry typically requires 阿里云邮件推送 or 腾讯邮件推送 · PIPL Art 38 concerns",
    );
  }
  if (input.channel === "draft-only") {
    warnings.push(
      "channel=draft-only · v0.1 D-M4-07 · no real emails sent · team manually dispatches drafts",
    );
  }
  if (input.seed_recipients.length > 200) {
    warnings.push(
      `seed size ${input.seed_recipients.length} exceeds v0.1 recommended 200 · consider batching or moving to v0.2`,
    );
  }
  if (input.pacing.max_per_day_per_domain > 50) {
    warnings.push(
      `pacing.max_per_day_per_domain=${input.pacing.max_per_day_per_domain} > 50 · deliverability risk`,
    );
  }

  const draftStep: PlannedStep = {
    kind: "draft-generation",
    title: `[Cold-Email #1] Draft generation for ${input.template_id}`,
    body: renderDraftBody(input),
    depends_on: [],
    suggested_adapter:
      input.target_industry === "zh-B2B" ? CHINESE_INDUSTRY_ADAPTER : DRAFT_ADAPTER,
    suggested_skills:
      input.target_industry === "zh-B2B"
        ? ["wewrite", "content-marketer"]
        : ["content-marketer"],
  };

  const sendStep: PlannedStep = {
    kind: "send-attempt",
    title: `[Cold-Email #2] Send attempts (${input.channel})`,
    body: renderSendBody(input),
    depends_on: ["draft-generation"],
    suggested_adapter: "routine",
    suggested_skills: [],
  };

  const replyStep: PlannedStep = {
    kind: "reply-handle",
    title: `[Cold-Email #3] Reply handling`,
    body: renderReplyBody(input),
    depends_on: [],
    suggested_adapter: DRAFT_ADAPTER,
    suggested_skills: ["content-marketer"],
  };

  const bounceStep: PlannedStep = {
    kind: "bounce-handle",
    title: `[Cold-Email #4] Bounce handling`,
    body: renderBounceBody(input),
    depends_on: [],
    suggested_adapter: "routine",
    suggested_skills: [],
  };

  const unsubStep: PlannedStep = {
    kind: "unsubscribe-handle",
    title: `[Cold-Email #5] Unsubscribe handling`,
    body: `Universal opt-out handler · public /unsubscribe endpoint · idempotent`,
    depends_on: [],
    suggested_adapter: "routine",
    suggested_skills: [],
  };

  const auditStep: PlannedStep = {
    kind: "compliance-audit-log",
    title: `[Cold-Email #6] Compliance audit log`,
    body: `Retention audit · GDPR 6y ∩ PIPL 3y = 3y = 1095 days.`,
    depends_on: [],
    suggested_adapter: "routine",
    suggested_skills: [],
  };

  const steps: PlannedStep[] = [
    draftStep,
    sendStep,
    replyStep,
    bounceStep,
    unsubStep,
    auditStep,
  ];

  const compliance_requirements = describeComplianceRequirements(input);

  return {
    sequence_id,
    parent_issue: {
      title: `Cold-Email Sequence · ${input.template_id} · ${input.target_industry}`,
      body: buildParentBody(input, steps),
    },
    steps,
    shared_memory_scope: `cold-email:${sequence_id}`,
    compliance_requirements,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Body renderers
// ---------------------------------------------------------------------------

function renderDraftBody(input: SequenceInput): string {
  return `## Role: Draft generator

Generate cold-email drafts for the following seed list · target_industry=${input.target_industry}.

## Recipients
Total: ${input.seed_recipients.length}
First 5: ${input.seed_recipients.slice(0, 5).join(", ")}${input.seed_recipients.length > 5 ? " ..." : ""}

## Template
Template id: ${input.template_id}

## Emit
Write to shared memory \`cold-email:{sequence_id}.drafts\`:
- shape: array of { recipient, subject, body_html, body_text, tracking_pixel? }

## Compliance
${input.target_industry === "zh-B2B" ? "PIPL Art 13 first-contact disclosure MUST prepend to body." : ""}
${input.target_industry === "B2B-SaaS-dev" ? "CAN-SPAM footer with sender_physical_address MUST be present." : ""}
`;
}

function renderSendBody(input: SequenceInput): string {
  return `## Role: Send loop · routine

Send drafts per pacing rules · channel=${input.channel}.

## Pacing
- max_per_day_per_domain: ${input.pacing.max_per_day_per_domain}
- warmup_target_sent: ${input.pacing.warmup_target_sent}
- warmup_deliverability_threshold: ${input.pacing.warmup_deliverability_threshold}

## Read
- shared memory \`cold-email:{sequence_id}.drafts\`
- state-machine.ts current state

## Emit
- \`send_batch_complete\` event per state-machine · updates total_sent
`;
}

function renderReplyBody(input: SequenceInput): string {
  return `## Role: Reply handler

Classify incoming replies. Universal unsubscribe keywords ("unsubscribe" / "退订" / "please stop") → close with unsubscribed=true, no HITL.

Interested reply keywords ("interested" / "请介绍" / "更多信息") → issue \`adapter.question\` to sender agent → agent decides:
1. Convert to CRM (HubSpot or Twenty)
2. Continue conversation manually
3. Escalate to human

## Emit
- \`reply_received\` event · state-machine updates counters
`;
}

function renderBounceBody(input: SequenceInput): string {
  return `## Role: Bounce handler

Classify bounces:
- hard bounce → recipient invalid · mark unsubscribed=true (auto)
- soft bounce → retry once after 24h
- complaint → immediate unsubscribe · escalate to compliance

## Emit
- \`bounce_received\` event with bounce_kind
`;
}

function describeComplianceRequirements(input: SequenceInput): string[] {
  const reqs: string[] = [];
  if (input.target_industry === "B2B-SaaS-dev") {
    reqs.push("CAN-SPAM: sender_physical_address in footer · unsubscribe link within 10 business days");
    reqs.push("GDPR: opt-in evidence OR business_justification (legitimate interest)");
  } else if (input.target_industry === "zh-B2B") {
    reqs.push("PIPL Art 13: first-contact disclosure prefix");
    reqs.push("PIPL Art 38: cross-border transfer requires separate consent");
    reqs.push("PIPL Art 47: 3-year retention cap");
  } else if (input.target_industry === "generic") {
    reqs.push("User-defined compliance · custom regime dispatch");
  }
  reqs.push("Universal: retention 3 years = GDPR 6y ∩ PIPL 3y (intersect · strictest)");
  return reqs;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildParentBody(input: SequenceInput, steps: PlannedStep[]): string {
  return [
    `## Original request`,
    `Seed list: ${input.seed_list_id}`,
    `Target industry: ${input.target_industry}`,
    `Template: ${input.template_id}`,
    `Sender: ${input.sender_email}`,
    `Channel: ${input.channel}`,
    ``,
    `## Sequence steps`,
    ...steps.map(
      (s) =>
        `- [${s.kind}] ${s.title} (depends_on: ${s.depends_on.join(", ") || "-"})`,
    ),
    ``,
    `## Shared memory`,
    `Scope: cold-email:{sequence_id}`,
    ``,
    `## Compliance`,
    ...describeComplianceRequirements(input).map((r) => `- ${r}`),
  ].join("\n");
}

function normalizeSequenceId(input: SequenceInput): string {
  if (input.sequence_id && input.sequence_id.trim().length > 0) {
    return input.sequence_id.trim();
  }
  const slug = `${input.seed_list_id}-${input.template_id}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug.length > 0 ? `coldemail-${slug}` : "coldemail-untitled";
}
