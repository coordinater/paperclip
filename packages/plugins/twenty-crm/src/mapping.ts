/**
 * paperclip ↔ Twenty core mapping · M4-03 MVP.
 *
 * Pure functions · deterministic. Both directions available but reverse
 * (Twenty → paperclip) is scaffold-only until M6+ (D-M4-06).
 *
 * Reference: `packages/plugins/twenty-crm/README.md` §5 core mapping design.
 * Shadow table: `plugin_ai_company_twenty_sync_state` (D-M4-05).
 */

import type { CreateCompanyInput, CreatePersonInput, TwentyOpportunity } from "./client.js";

// ---------------------------------------------------------------------------
// paperclip domain types (subset · to avoid full paperclip SDK import)
// ---------------------------------------------------------------------------

export interface PaperclipAgent {
  id: string;
  name: string;
  role: string;
  parent_id?: string;
  company_id: string;
}

export interface PaperclipIssue {
  id: string;
  title: string;
  type: "feature" | "task" | "bug";
  status:
    | "open"
    | "pending_approval"
    | "checked_out"
    | "closed"
    | "blocked"
    | "cancelled";
  assignee_agent_id?: string;
  parent_id?: string;
  company_id: string;
}

export interface PaperclipUser {
  id: string;
  full_name: string;
  email: string;
  role?: string;
  company_id: string;
}

export interface PaperclipActivityLog {
  id: string;
  action: string;
  metadata?: Record<string, unknown>;
  actor_type: "agent" | "user" | "system";
  actor_id?: string;
  issue_id?: string;
  ts: string;
}

// ---------------------------------------------------------------------------
// Forward mapping (paperclip → Twenty) · MVP done
// ---------------------------------------------------------------------------

/**
 * Root agent of a tree → Twenty Company.
 * Uses agent.name as company name · role as description.
 */
export function agentToCompany(
  agent: PaperclipAgent,
  domainOverride?: string,
): CreateCompanyInput {
  return {
    name: agent.name,
    domainName: domainOverride,
    // employees calculated from paperclip subtree count (not done here · adapter counts)
  };
}

/**
 * Non-root agent → Twenty Person.
 * Uses agent.name split on first space for firstName/lastName.
 */
export function agentToPerson(agent: PaperclipAgent): CreatePersonInput {
  const parts = agent.name.split(/\s+/);
  return {
    firstName: parts[0] ?? agent.name,
    lastName: parts.slice(1).join(" ") || "",
    jobTitle: agent.role,
    // email not on agent domain · left to caller (user email)
  };
}

/**
 * paperclip user → Twenty Person.
 */
export function userToPerson(user: PaperclipUser): CreatePersonInput {
  const parts = user.full_name.split(/\s+/);
  return {
    firstName: parts[0] ?? user.full_name,
    lastName: parts.slice(1).join(" ") || "",
    email: user.email,
    jobTitle: user.role,
  };
}

/**
 * paperclip feature-typed issue → Twenty Opportunity.
 * Uses issueStatusToStage.
 */
export function issueToOpportunity(
  issue: PaperclipIssue,
): { name: string; stage: TwentyOpportunity["stage"]; amount?: number } {
  return {
    name: issue.title,
    stage: issueStatusToStage(issue.status),
    // amount is business-specific · not on issue by default
  };
}

/**
 * activity_log → Twenty Note.
 * body renders the metadata in JSON block · title is the action name.
 */
export function activityLogToNote(
  log: PaperclipActivityLog,
  target: { type: "Company" | "Person" | "Opportunity"; id: string },
): { title: string; body: string; targetType: typeof target.type; targetId: string } {
  return {
    title: log.action,
    body: `Actor: ${log.actor_type}:${log.actor_id ?? "system"}\nTimestamp: ${log.ts}\nMetadata: ${
      log.metadata ? JSON.stringify(log.metadata, null, 2) : "(none)"
    }`,
    targetType: target.type,
    targetId: target.id,
  };
}

// ---------------------------------------------------------------------------
// Status/stage mapping
// ---------------------------------------------------------------------------

/**
 * paperclip issue.status → Twenty Opportunity.stage.
 * Table per README §5.3.
 */
export function issueStatusToStage(
  status: PaperclipIssue["status"],
): TwentyOpportunity["stage"] {
  switch (status) {
    case "open":
      return "NEW";
    case "pending_approval":
      return "SCREENING";
    case "checked_out":
      return "MEETING"; // work in progress · analogous to opportunity being actively pursued
    case "blocked":
      return "MEETING"; // still tracked as active but stuck
    case "closed":
      return "CUSTOMER"; // won
    case "cancelled":
      return "CUSTOMER"; // closed lost · Twenty doesn't have LOST enum by default · treat as terminal
    default:
      return "NEW";
  }
}

/**
 * Twenty Opportunity.stage → paperclip issue.status.
 * Only used by reverse sync (M6+) · scaffold-only per D-M4-06.
 */
export function stageToIssueStatus(
  stage: TwentyOpportunity["stage"],
): PaperclipIssue["status"] {
  switch (stage) {
    case "NEW":
      return "open";
    case "SCREENING":
      return "pending_approval";
    case "MEETING":
    case "PROPOSAL":
      return "checked_out";
    case "CUSTOMER":
      return "closed";
    default:
      return "open";
  }
}

// ---------------------------------------------------------------------------
// Reverse mapping (Twenty → paperclip) · scaffold only (D-M4-06 · M6+)
// ---------------------------------------------------------------------------

/**
 * When a Twenty webhook arrives · translate to paperclip-side update spec.
 * Scaffold only · does not perform the write · returns spec for the caller.
 */
export function twentyEventToPaperclipUpdate(event: {
  kind: "opportunity.stage_changed" | "person.created" | "note.created";
  twenty_id: string;
  payload: Record<string, unknown>;
}): {
  action: "update_issue_status" | "insert_plugin_entity" | "add_issue_comment";
  target?: string;
  changes?: Record<string, unknown>;
  scaffold_note: string;
} {
  switch (event.kind) {
    case "opportunity.stage_changed": {
      const newStage = event.payload.new_stage as TwentyOpportunity["stage"];
      return {
        action: "update_issue_status",
        target: `twenty_opportunity:${event.twenty_id}`,
        changes: { status: stageToIssueStatus(newStage) },
        scaffold_note:
          "M6+ (D-M4-06) · real impl looks up issue_id via shadow table + calls ctx.issues.update via approval-router (D-M2-13) hook",
      };
    }
    case "person.created": {
      return {
        action: "insert_plugin_entity",
        target: "plugin_entities",
        changes: {
          entity_type: "twenty_person",
          data: event.payload,
        },
        scaffold_note:
          "M6+ · Person doesn't map to core paperclip user directly · store in plugin_entities (Pattern-11 shadow)",
      };
    }
    case "note.created": {
      return {
        action: "add_issue_comment",
        target: `twenty_note:${event.twenty_id}`,
        changes: { body: event.payload.body },
        scaffold_note:
          "M6+ · match Twenty Note.target → issue via shadow · add comment via ctx.issues.createComment",
      };
    }
    default:
      return {
        action: "insert_plugin_entity",
        target: "plugin_entities",
        scaffold_note: "unknown event kind · store raw for audit",
      };
  }
}

// ---------------------------------------------------------------------------
// Shadow-table id mapping (in-memory helper · real impl uses ctx.state / DB)
// ---------------------------------------------------------------------------

export interface SyncMappingRow {
  paperclip_kind: "agent" | "issue" | "user" | "plugin_entity" | "activity_log";
  paperclip_id: string;
  twenty_kind: "Company" | "Person" | "Opportunity" | "Task" | "Note";
  twenty_id: string;
  last_synced_at: string;
  sync_direction: "outbound" | "inbound" | "bidirectional";
}

/**
 * Compose unique key for shadow-table row.
 */
export function shadowKey(row: Pick<SyncMappingRow, "paperclip_kind" | "paperclip_id" | "twenty_kind">): string {
  return `${row.paperclip_kind}:${row.paperclip_id}→${row.twenty_kind}`;
}
