/**
 * Twenty CRM plugin worker · onWebhook dispatch · Pattern-2.
 *
 * M4-03 MVP · dispatches:
 * - sync-agent-to-company · agent → Twenty Company
 * - sync-issue-to-opportunity · issue → Twenty Opportunity
 * - sync-user-to-person · user → Twenty Person
 * - upsert-note · activity_log → Twenty Note
 * - twenty-inbound · reverse sync scaffold (M6+ D-M4-06)
 */

import {
  agentToCompany,
  agentToPerson,
  activityLogToNote,
  issueToOpportunity,
  twentyEventToPaperclipUpdate,
  userToPerson,
  type PaperclipActivityLog,
  type PaperclipAgent,
  type PaperclipIssue,
  type PaperclipUser,
} from "./mapping.js";

export interface WebhookInput {
  endpointKey: string;
  body?: unknown;
}

export interface WebhookResponse {
  status: number;
  body: unknown;
}

export function dispatchWebhook(input: WebhookInput): WebhookResponse {
  switch (input.endpointKey) {
    case "sync-agent-to-company":
      return handleAgentSync(input.body);
    case "sync-issue-to-opportunity":
      return handleIssueSync(input.body);
    case "sync-user-to-person":
      return handleUserSync(input.body);
    case "upsert-note":
      return handleNoteUpsert(input.body);
    case "twenty-inbound":
      return handleTwentyInbound(input.body);
    default:
      return {
        status: 404,
        body: { error: `unknown endpoint: ${input.endpointKey}` },
      };
  }
}

function handleAgentSync(body: unknown): WebhookResponse {
  const parsed = parseAgent(body);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const agent = parsed.value.agent;
  const isRoot = !agent.parent_id;
  const spec = isRoot
    ? { kind: "Company" as const, input: agentToCompany(agent, parsed.value.domain_override) }
    : { kind: "Person" as const, input: agentToPerson(agent) };
  return {
    status: 202,
    body: {
      accepted: true,
      target: spec.kind,
      spec: spec.input,
      note: "real GraphQL create/upsert happens after client injection · MVP returns spec only",
    },
  };
}

function handleIssueSync(body: unknown): WebhookResponse {
  const parsed = parseIssue(body);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const issue = parsed.value.issue;
  if (issue.type !== "feature") {
    return {
      status: 200,
      body: {
        accepted: false,
        note: `only type=feature issues become Opportunities · got type=${issue.type} · skip or map to Task (M5+)`,
      },
    };
  }
  const spec = issueToOpportunity(issue);
  return {
    status: 202,
    body: { accepted: true, target: "Opportunity", spec },
  };
}

function handleUserSync(body: unknown): WebhookResponse {
  const parsed = parseUser(body);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  const spec = userToPerson(parsed.value.user);
  return {
    status: 202,
    body: { accepted: true, target: "Person", spec },
  };
}

function handleNoteUpsert(body: unknown): WebhookResponse {
  if (!body || typeof body !== "object") {
    return { status: 400, body: { error: "body must be object" } };
  }
  const b = body as Record<string, unknown>;
  if (!b.log || !b.target) {
    return { status: 400, body: { error: "missing log or target" } };
  }
  try {
    const spec = activityLogToNote(
      b.log as PaperclipActivityLog,
      b.target as { type: "Company" | "Person" | "Opportunity"; id: string },
    );
    return { status: 202, body: { accepted: true, target: "Note", spec } };
  } catch (e) {
    return {
      status: 400,
      body: { error: `mapping failed: ${(e as Error).message}` },
    };
  }
}

function handleTwentyInbound(body: unknown): WebhookResponse {
  // Reverse sync · scaffold only per D-M4-06 · M6+ complete
  if (!body || typeof body !== "object") {
    return { status: 400, body: { error: "body must be object" } };
  }
  const b = body as {
    kind?: string;
    twenty_id?: string;
    payload?: Record<string, unknown>;
  };
  if (!b.kind || !b.twenty_id) {
    return {
      status: 400,
      body: { error: "missing kind or twenty_id" },
    };
  }
  const supported = [
    "opportunity.stage_changed",
    "person.created",
    "note.created",
  ];
  if (!supported.includes(b.kind)) {
    return {
      status: 200,
      body: {
        accepted: false,
        note: `unsupported event kind · accepted list: ${supported.join(", ")}`,
      },
    };
  }
  const upd = twentyEventToPaperclipUpdate({
    kind: b.kind as "opportunity.stage_changed" | "person.created" | "note.created",
    twenty_id: b.twenty_id,
    payload: b.payload ?? {},
  });
  return {
    status: 202,
    body: {
      accepted: true,
      spec: upd,
      note: "M6+ D-M4-06 · reverse sync scaffold only · no state write executed",
    },
  };
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function parseAgent(
  body: unknown,
): Parsed<{ agent: PaperclipAgent; domain_override?: string }> {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "body must be object" };
  }
  const b = body as Record<string, unknown>;
  if (!b.agent || typeof b.agent !== "object") {
    return { ok: false, error: "missing field: agent" };
  }
  return {
    ok: true,
    value: {
      agent: b.agent as PaperclipAgent,
      domain_override: typeof b.domain_override === "string" ? b.domain_override : undefined,
    },
  };
}

function parseIssue(body: unknown): Parsed<{ issue: PaperclipIssue }> {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "body must be object" };
  }
  const b = body as Record<string, unknown>;
  if (!b.issue || typeof b.issue !== "object") {
    return { ok: false, error: "missing field: issue" };
  }
  return { ok: true, value: { issue: b.issue as PaperclipIssue } };
}

function parseUser(body: unknown): Parsed<{ user: PaperclipUser }> {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "body must be object" };
  }
  const b = body as Record<string, unknown>;
  if (!b.user || typeof b.user !== "object") {
    return { ok: false, error: "missing field: user" };
  }
  return { ok: true, value: { user: b.user as PaperclipUser } };
}
