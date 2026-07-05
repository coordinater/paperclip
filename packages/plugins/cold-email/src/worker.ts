/**
 * Cold-email plugin worker · onWebhook + onRoutine dispatch · Pattern-2.
 *
 * M4-02 MVP scaffold. Dispatches:
 * - create-sequence  · calls planSequence · returns plan
 * - handle-reply     · uses state-machine.nextState
 * - handle-bounce    · uses state-machine.nextState
 * - unsubscribe      · idempotent public opt-out
 * - warmup-tick / reply-sweep / bounce-sweep / compliance-audit (routines)
 */

import { planSequence, type SequenceInput } from "./orchestrator.js";
import {
  initialState,
  nextState,
  type SequenceEvent,
  type StateContext,
} from "./state-machine.js";
import { preSendCheck, type ComplianceContext, type Recipient } from "./compliance.js";

// ---------------------------------------------------------------------------
// Webhook dispatch
// ---------------------------------------------------------------------------

export interface WebhookInput {
  endpointKey: string;
  body?: unknown;
  query?: Record<string, string>;
}

export interface WebhookResponse {
  status: number;
  body: unknown;
}

export function dispatchWebhook(input: WebhookInput): WebhookResponse {
  switch (input.endpointKey) {
    case "create-sequence":
      return handleCreateSequence(input.body);
    case "handle-reply":
      return handleReply(input.body);
    case "handle-bounce":
      return handleBounce(input.body);
    case "unsubscribe":
      return handleUnsubscribe(input.query ?? {});
    default:
      return {
        status: 404,
        body: { error: `unknown endpoint: ${input.endpointKey}` },
      };
  }
}

function handleCreateSequence(body: unknown): WebhookResponse {
  const parsed = parseCreateSequenceInput(body);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const plan = planSequence(parsed.value);
  return {
    status: 202,
    body: {
      sequence_id: plan.sequence_id,
      parent_issue_title: plan.parent_issue.title,
      steps_count: plan.steps.length,
      warnings: plan.warnings,
      compliance_requirements: plan.compliance_requirements,
    },
  };
}

function handleReply(body: unknown): WebhookResponse {
  const parsed = parseReplyInput(body);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const { message_id, is_unsubscribe } = parsed.value;
  // For MVP · just return the event that would be applied to state machine
  // Real impl looks up sequence context from plugin_state · applies event · persists
  const event: SequenceEvent = {
    kind: "reply_received",
    message_id,
    is_unsubscribe,
  };
  return {
    status: 200,
    body: { accepted: true, event },
  };
}

function handleBounce(body: unknown): WebhookResponse {
  const parsed = parseBounceInput(body);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const event: SequenceEvent = {
    kind: "bounce_received",
    message_id: parsed.value.message_id,
    bounce_kind: parsed.value.bounce_kind,
  };
  return { status: 200, body: { accepted: true, event } };
}

function handleUnsubscribe(query: Record<string, string>): WebhookResponse {
  const token = query.token;
  if (!token || typeof token !== "string" || !token.startsWith("unsub_")) {
    return { status: 400, body: { error: "invalid or missing token" } };
  }
  // Real impl looks up token → recipient · marks unsubscribed=true
  // MVP: idempotent 200
  return {
    status: 200,
    body: { unsubscribed: true, token },
  };
}

// ---------------------------------------------------------------------------
// Routine dispatch
// ---------------------------------------------------------------------------

export interface RoutineInput {
  key: string;
  now?: Date;
}

export interface RoutineResponse {
  status: "ok" | "skipped" | "error";
  message: string;
}

export function dispatchRoutine(input: RoutineInput): RoutineResponse {
  switch (input.key) {
    case "warmup-tick":
      return { status: "ok", message: "warmup-tick executed (scaffold · no I/O)" };
    case "reply-sweep":
      return { status: "ok", message: "reply-sweep executed (scaffold · no I/O)" };
    case "bounce-sweep":
      return { status: "ok", message: "bounce-sweep executed (scaffold · no I/O)" };
    case "compliance-audit":
      return {
        status: "ok",
        message: "compliance-audit executed (scaffold · retention window 3 years)",
      };
    default:
      return { status: "error", message: `unknown routine key: ${input.key}` };
  }
}

// ---------------------------------------------------------------------------
// Input parsers (defensive · not exhaustive)
// ---------------------------------------------------------------------------

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function parseCreateSequenceInput(body: unknown): Parsed<SequenceInput> {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "body must be object" };
  }
  const b = body as Record<string, unknown>;
  const requiredKeys = [
    "seed_list_id",
    "seed_recipients",
    "target_industry",
    "template_id",
    "sender_email",
    "channel",
    "pacing",
  ] as const;
  for (const k of requiredKeys) {
    if (!(k in b)) return { ok: false, error: `missing field: ${k}` };
  }
  return { ok: true, value: b as unknown as SequenceInput };
}

function parseReplyInput(
  body: unknown,
): Parsed<{ message_id: string; is_unsubscribe: boolean; sender?: string }> {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "body must be object" };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.message_id !== "string") {
    return { ok: false, error: "message_id must be string" };
  }
  const isUnsub =
    typeof b.is_unsubscribe === "boolean"
      ? b.is_unsubscribe
      : detectUnsubscribeIntent(String(b.body ?? ""));
  return {
    ok: true,
    value: {
      message_id: b.message_id,
      is_unsubscribe: isUnsub,
      sender: typeof b.sender === "string" ? b.sender : undefined,
    },
  };
}

function parseBounceInput(
  body: unknown,
): Parsed<{ message_id: string; bounce_kind: "hard" | "soft" | "complaint" }> {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "body must be object" };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.message_id !== "string") {
    return { ok: false, error: "message_id must be string" };
  }
  const kind = String(b.bounce_kind ?? "hard");
  if (kind !== "hard" && kind !== "soft" && kind !== "complaint") {
    return { ok: false, error: "bounce_kind must be hard/soft/complaint" };
  }
  return { ok: true, value: { message_id: b.message_id, bounce_kind: kind } };
}

/**
 * Detect unsubscribe intent from reply body · used when webhook doesn't set the flag.
 * Multilingual keyword match · additive · false positives accepted (safe side).
 */
export function detectUnsubscribeIntent(replyBody: string): boolean {
  const substringKeywords = [
    "unsubscribe",
    "please stop",
    "remove me",
    "退订",
    "取消订阅",
    "不要发",
    "拒收",
    "sortez-moi",
    "désabonner",
  ];
  // Word-boundary keywords · match reply body of just "STOP" but not "one-stop shop"
  const wordBoundaryKeywords = ["stop"];
  const lower = replyBody.toLowerCase();
  if (substringKeywords.some((k) => lower.includes(k.toLowerCase()))) return true;
  for (const k of wordBoundaryKeywords) {
    const re = new RegExp(`(^|\\s|[.,!?;:])${k}(\\s|$|[.,!?;:])`, "i");
    if (re.test(lower)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Re-exports for consumers (test convenience)
// ---------------------------------------------------------------------------

export {
  initialState,
  nextState,
  preSendCheck,
  planSequence,
  type ComplianceContext,
  type Recipient,
  type SequenceEvent,
  type StateContext,
};
