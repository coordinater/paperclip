import { describe, expect, it } from "vitest";
import { dispatchWebhook } from "./worker.js";

describe("dispatchWebhook · sync-agent-to-company", () => {
  it("root agent syncs to Company", () => {
    const res = dispatchWebhook({
      endpointKey: "sync-agent-to-company",
      body: {
        agent: {
          id: "a1",
          name: "AI Company",
          role: "CEO",
          company_id: "c1",
        },
      },
    });
    expect(res.status).toBe(202);
    const body = res.body as { target: string; spec: { name: string } };
    expect(body.target).toBe("Company");
    expect(body.spec.name).toBe("AI Company");
  });

  it("child agent syncs to Person", () => {
    const res = dispatchWebhook({
      endpointKey: "sync-agent-to-company",
      body: {
        agent: {
          id: "a2",
          name: "Alice Smith",
          role: "Eng",
          parent_id: "a1",
          company_id: "c1",
        },
      },
    });
    expect(res.status).toBe(202);
    const body = res.body as { target: string; spec: { firstName: string } };
    expect(body.target).toBe("Person");
    expect(body.spec.firstName).toBe("Alice");
  });

  it("accepts domain_override for root", () => {
    const res = dispatchWebhook({
      endpointKey: "sync-agent-to-company",
      body: {
        agent: { id: "a1", name: "AI Co", role: "CEO", company_id: "c1" },
        domain_override: "ai.co",
      },
    });
    const body = res.body as { spec: { domainName?: string } };
    expect(body.spec.domainName).toBe("ai.co");
  });

  it("returns 400 without agent field", () => {
    const res = dispatchWebhook({
      endpointKey: "sync-agent-to-company",
      body: {},
    });
    expect(res.status).toBe(400);
  });
});

describe("dispatchWebhook · sync-issue-to-opportunity", () => {
  it("feature-typed issue syncs to Opportunity", () => {
    const res = dispatchWebhook({
      endpointKey: "sync-issue-to-opportunity",
      body: {
        issue: {
          id: "i1",
          title: "Big Feature",
          type: "feature",
          status: "open",
          company_id: "c1",
        },
      },
    });
    expect(res.status).toBe(202);
    const body = res.body as { target: string; spec: { name: string; stage: string } };
    expect(body.target).toBe("Opportunity");
    expect(body.spec.stage).toBe("NEW");
  });

  it("task-typed issue is skipped (200 accepted=false)", () => {
    const res = dispatchWebhook({
      endpointKey: "sync-issue-to-opportunity",
      body: {
        issue: {
          id: "i2",
          title: "small task",
          type: "task",
          status: "open",
          company_id: "c1",
        },
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as { accepted: boolean };
    expect(body.accepted).toBe(false);
  });

  it("returns 400 without issue field", () => {
    const res = dispatchWebhook({
      endpointKey: "sync-issue-to-opportunity",
      body: {},
    });
    expect(res.status).toBe(400);
  });
});

describe("dispatchWebhook · sync-user-to-person", () => {
  it("returns Person spec with email", () => {
    const res = dispatchWebhook({
      endpointKey: "sync-user-to-person",
      body: {
        user: {
          id: "u1",
          full_name: "Bob Jones",
          email: "bob@example.com",
          role: "PM",
          company_id: "c1",
        },
      },
    });
    expect(res.status).toBe(202);
    const body = res.body as { spec: { email?: string } };
    expect(body.spec.email).toBe("bob@example.com");
  });
});

describe("dispatchWebhook · upsert-note", () => {
  it("returns Note spec for activity_log + target", () => {
    const res = dispatchWebhook({
      endpointKey: "upsert-note",
      body: {
        log: {
          id: "l1",
          action: "issue_closed",
          metadata: { pr: "x" },
          actor_type: "agent",
          actor_id: "a1",
          ts: "2026-07-04T12:00:00Z",
        },
        target: { type: "Opportunity", id: "op-1" },
      },
    });
    expect(res.status).toBe(202);
    const body = res.body as { spec: { targetType: string } };
    expect(body.spec.targetType).toBe("Opportunity");
  });

  it("returns 400 without log or target", () => {
    const res = dispatchWebhook({
      endpointKey: "upsert-note",
      body: { log: {} },
    });
    expect(res.status).toBe(400);
  });
});

describe("dispatchWebhook · twenty-inbound (reverse sync M6+ scaffold)", () => {
  it("opportunity.stage_changed returns update_issue_status spec", () => {
    const res = dispatchWebhook({
      endpointKey: "twenty-inbound",
      body: {
        kind: "opportunity.stage_changed",
        twenty_id: "op-1",
        payload: { new_stage: "MEETING" },
      },
    });
    expect(res.status).toBe(202);
    const body = res.body as { spec: { action: string } };
    expect(body.spec.action).toBe("update_issue_status");
  });

  it("unsupported event kind returns 200 accepted=false", () => {
    const res = dispatchWebhook({
      endpointKey: "twenty-inbound",
      body: {
        kind: "wat.something",
        twenty_id: "x",
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as { accepted: boolean };
    expect(body.accepted).toBe(false);
  });

  it("returns 400 without kind or twenty_id", () => {
    const res = dispatchWebhook({
      endpointKey: "twenty-inbound",
      body: { payload: {} },
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
