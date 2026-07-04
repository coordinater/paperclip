import { describe, expect, it } from "vitest";
import {
  activityLogToNote,
  agentToCompany,
  agentToPerson,
  issueStatusToStage,
  issueToOpportunity,
  shadowKey,
  stageToIssueStatus,
  twentyEventToPaperclipUpdate,
  userToPerson,
  type PaperclipAgent,
  type PaperclipIssue,
  type PaperclipUser,
} from "./mapping.js";

const rootAgent: PaperclipAgent = {
  id: "a-root",
  name: "AI Company",
  role: "CEO",
  company_id: "c1",
};

const childAgent: PaperclipAgent = {
  id: "a-child",
  name: "Alice Smith",
  role: "Engineer",
  parent_id: "a-root",
  company_id: "c1",
};

const user: PaperclipUser = {
  id: "u1",
  full_name: "Bob Jones",
  email: "bob@example.com",
  role: "PM",
  company_id: "c1",
};

const issue: PaperclipIssue = {
  id: "i1",
  title: "Add cold-email integration",
  type: "feature",
  status: "open",
  company_id: "c1",
};

describe("agentToCompany", () => {
  it("uses agent.name as company name", () => {
    const c = agentToCompany(rootAgent);
    expect(c.name).toBe("AI Company");
  });

  it("accepts domain override", () => {
    const c = agentToCompany(rootAgent, "ai.co");
    expect(c.domainName).toBe("ai.co");
  });
});

describe("agentToPerson", () => {
  it("splits name into first/last", () => {
    const p = agentToPerson(childAgent);
    expect(p.firstName).toBe("Alice");
    expect(p.lastName).toBe("Smith");
    expect(p.jobTitle).toBe("Engineer");
  });

  it("handles single-word name", () => {
    const p = agentToPerson({ ...childAgent, name: "Bob" });
    expect(p.firstName).toBe("Bob");
    expect(p.lastName).toBe("");
  });

  it("handles 3+ word name", () => {
    const p = agentToPerson({ ...childAgent, name: "Alice Bob Charlie" });
    expect(p.firstName).toBe("Alice");
    expect(p.lastName).toBe("Bob Charlie");
  });
});

describe("userToPerson", () => {
  it("uses user email and role", () => {
    const p = userToPerson(user);
    expect(p.email).toBe("bob@example.com");
    expect(p.jobTitle).toBe("PM");
  });
});

describe("issueToOpportunity", () => {
  it("passes title to name and maps status", () => {
    const o = issueToOpportunity(issue);
    expect(o.name).toBe("Add cold-email integration");
    expect(o.stage).toBe("NEW");
  });
});

describe("issueStatusToStage forward mapping", () => {
  const cases: Array<[PaperclipIssue["status"], string]> = [
    ["open", "NEW"],
    ["pending_approval", "SCREENING"],
    ["checked_out", "MEETING"],
    ["blocked", "MEETING"],
    ["closed", "CUSTOMER"],
    ["cancelled", "CUSTOMER"],
  ];
  it.each(cases)("%s → %s", (status, expected) => {
    expect(issueStatusToStage(status)).toBe(expected);
  });
});

describe("stageToIssueStatus reverse mapping (M6+ · scaffold)", () => {
  const cases: Array<[
    "NEW" | "SCREENING" | "MEETING" | "PROPOSAL" | "CUSTOMER",
    PaperclipIssue["status"],
  ]> = [
    ["NEW", "open"],
    ["SCREENING", "pending_approval"],
    ["MEETING", "checked_out"],
    ["PROPOSAL", "checked_out"],
    ["CUSTOMER", "closed"],
  ];
  it.each(cases)("%s → %s", (stage, expected) => {
    expect(stageToIssueStatus(stage)).toBe(expected);
  });
});

describe("activityLogToNote", () => {
  it("renders title from action, body from metadata", () => {
    const n = activityLogToNote(
      {
        id: "l1",
        action: "issue_closed",
        metadata: { pr_url: "https://github.com/x/y/pull/1" },
        actor_type: "agent",
        actor_id: "a-child",
        ts: "2026-07-04T12:00:00Z",
      },
      { type: "Opportunity", id: "op-1" },
    );
    expect(n.title).toBe("issue_closed");
    expect(n.body).toContain("Actor: agent:a-child");
    expect(n.body).toContain("pr_url");
    expect(n.targetType).toBe("Opportunity");
  });

  it("handles missing metadata gracefully", () => {
    const n = activityLogToNote(
      {
        id: "l1",
        action: "issue_opened",
        actor_type: "user",
        ts: "2026-07-04T12:00:00Z",
      },
      { type: "Company", id: "co-1" },
    );
    expect(n.body).toContain("Metadata: (none)");
  });
});

describe("twentyEventToPaperclipUpdate (reverse · M6+ scaffold)", () => {
  it("opportunity.stage_changed returns update_issue_status spec", () => {
    const upd = twentyEventToPaperclipUpdate({
      kind: "opportunity.stage_changed",
      twenty_id: "op-1",
      payload: { new_stage: "MEETING" },
    });
    expect(upd.action).toBe("update_issue_status");
    expect(upd.changes?.status).toBe("checked_out");
    expect(upd.scaffold_note).toContain("M6+");
  });

  it("person.created returns insert_plugin_entity spec", () => {
    const upd = twentyEventToPaperclipUpdate({
      kind: "person.created",
      twenty_id: "p-1",
      payload: { name: "Alice" },
    });
    expect(upd.action).toBe("insert_plugin_entity");
    expect(upd.changes?.entity_type).toBe("twenty_person");
  });

  it("note.created returns add_issue_comment spec", () => {
    const upd = twentyEventToPaperclipUpdate({
      kind: "note.created",
      twenty_id: "n-1",
      payload: { body: "hello" },
    });
    expect(upd.action).toBe("add_issue_comment");
    expect(upd.changes?.body).toBe("hello");
  });
});

describe("shadowKey", () => {
  it("produces stable composite key", () => {
    const k = shadowKey({
      paperclip_kind: "agent",
      paperclip_id: "a1",
      twenty_kind: "Company",
    });
    expect(k).toBe("agent:a1→Company");
  });

  it("differs across twenty_kind for same paperclip id", () => {
    const k1 = shadowKey({
      paperclip_kind: "agent",
      paperclip_id: "a1",
      twenty_kind: "Company",
    });
    const k2 = shadowKey({
      paperclip_kind: "agent",
      paperclip_id: "a1",
      twenty_kind: "Person",
    });
    expect(k1).not.toBe(k2);
  });
});

describe("mapping · determinism (Pattern-4)", () => {
  it("agentToCompany is deterministic", () => {
    const a = JSON.stringify(agentToCompany(rootAgent, "x.com"));
    const b = JSON.stringify(agentToCompany(rootAgent, "x.com"));
    expect(a).toBe(b);
  });

  it("issueToOpportunity is deterministic", () => {
    const a = JSON.stringify(issueToOpportunity(issue));
    const b = JSON.stringify(issueToOpportunity(issue));
    expect(a).toBe(b);
  });
});
