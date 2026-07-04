import { describe, expect, it, vi } from "vitest";
import { onWebhook, parseIssueInput } from "./worker.js";
import type { MagisPluginCtx } from "./worker.js";

describe("parseIssueInput", () => {
  it("accepts minimal valid input", () => {
    const r = parseIssueInput({ title: "Fix bug", body: "" });
    expect(r.ok).toBe(true);
  });
  it("rejects missing title", () => {
    expect(parseIssueInput({ body: "x" }).ok).toBe(false);
    expect(parseIssueInput({}).ok).toBe(false);
  });
  it("rejects non-object", () => {
    expect(parseIssueInput(null).ok).toBe(false);
    expect(parseIssueInput([]).ok).toBe(false);
  });
  it("preserves optional hints", () => {
    const r = parseIssueInput({
      title: "x",
      body: "y",
      repo_root: "/repo",
      test_command: "pytest",
      issue_id: "custom-1",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.repo_root).toBe("/repo");
      expect(r.value.test_command).toBe("pytest");
      expect(r.value.issue_id).toBe("custom-1");
    }
  });
});

describe("onWebhook · endpoint dispatch", () => {
  const emptyCtx: MagisPluginCtx = {};

  it("returns 404 on unknown endpoint", async () => {
    const r = await onWebhook({ endpointKey: "does-not-exist" }, emptyCtx);
    expect(r.status).toBe(404);
  });

  it("plan-issue returns 405 for non-POST", async () => {
    const r = await onWebhook(
      { endpointKey: "plan-issue", method: "GET", body: { title: "x" } },
      emptyCtx,
    );
    expect(r.status).toBe(405);
  });

  it("plan-issue returns 400 for invalid body", async () => {
    const r = await onWebhook(
      { endpointKey: "plan-issue", method: "POST", body: {} },
      emptyCtx,
    );
    expect(r.status).toBe(400);
  });

  it("plan-issue returns 200 + plan and persists via savePlan", async () => {
    const savePlan = vi.fn(async () => {});
    const logActivity = vi.fn(async () => {});
    const r = await onWebhook(
      {
        endpointKey: "plan-issue",
        method: "POST",
        body: { title: "Fix login", body: "clicking does nothing" },
      },
      { savePlan, logActivity },
    );
    expect(r.status).toBe(200);
    expect(savePlan).toHaveBeenCalledOnce();
    expect(logActivity).toHaveBeenCalledWith("magis_lite_planned", expect.any(Object));
    const plan = r.body as { sub_issues: unknown[] };
    expect(plan.sub_issues).toHaveLength(5);
  });

  it("get-plan returns 400 without issue_id", async () => {
    const r = await onWebhook({ endpointKey: "get-plan" }, emptyCtx);
    expect(r.status).toBe(400);
  });

  it("get-plan returns 501 when readPlan not wired", async () => {
    const r = await onWebhook(
      { endpointKey: "get-plan", query: { issue_id: "x" } },
      emptyCtx,
    );
    expect(r.status).toBe(501);
  });

  it("get-plan returns 404 when readPlan resolves null", async () => {
    const r = await onWebhook(
      { endpointKey: "get-plan", query: { issue_id: "missing" } },
      { readPlan: async () => null },
    );
    expect(r.status).toBe(404);
  });

  it("get-plan returns 200 when readPlan resolves plan", async () => {
    const plan = {
      issue_id: "x",
      parent_issue: { title: "t", body: "b" },
      sub_issues: [],
      shared_memory_scope: "magis-lite:x",
      warnings: [],
    };
    const r = await onWebhook(
      { endpointKey: "get-plan", query: { issue_id: "x" } },
      { readPlan: async () => plan },
    );
    expect(r.status).toBe(200);
    expect(r.body).toEqual(plan);
  });
});
