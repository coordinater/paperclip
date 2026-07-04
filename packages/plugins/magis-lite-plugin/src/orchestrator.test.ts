import { describe, expect, it } from "vitest";
import { planMagis } from "./orchestrator.js";

describe("planMagis · plan shape", () => {
  it("produces 5 sub-issues (analysis + localize + edit + test_write + test_run)", () => {
    const plan = planMagis({
      title: "Fix login redirect",
      body: "clicking login does nothing",
    });
    expect(plan.sub_issues).toHaveLength(5);
    const kinds = plan.sub_issues.map((s) => s.kind);
    expect(kinds).toEqual([
      "requirements_analysis",
      "code_localization",
      "code_edit",
      "test_write",
      "test_run",
    ]);
  });

  it("assigns each sub-issue to the correct role", () => {
    const plan = planMagis({ title: "Fix login", body: "body" });
    const roleOf = (kind: string) =>
      plan.sub_issues.find((s) => s.kind === kind)?.role;
    expect(roleOf("requirements_analysis")).toBe("manager");
    expect(roleOf("code_localization")).toBe("repository_custodian");
    expect(roleOf("code_edit")).toBe("developer");
    expect(roleOf("test_write")).toBe("qa");
    expect(roleOf("test_run")).toBe("qa");
  });

  it("QA test_write blocks on code_localization (not code_edit)", () => {
    const plan = planMagis({ title: "x", body: "y" });
    const testWrite = plan.sub_issues.find((s) => s.kind === "test_write")!;
    expect(testWrite.depends_on).toEqual(["code_localization"]);
  });

  it("QA test_run blocks on both code_edit and test_write", () => {
    const plan = planMagis({ title: "x", body: "y" });
    const testRun = plan.sub_issues.find((s) => s.kind === "test_run")!;
    expect(testRun.depends_on.sort()).toEqual(["code_edit", "test_write"]);
  });

  it("code_edit blocks on code_localization only", () => {
    const plan = planMagis({ title: "x", body: "y" });
    const edit = plan.sub_issues.find((s) => s.kind === "code_edit")!;
    expect(edit.depends_on).toEqual(["code_localization"]);
  });

  it("requirements_analysis has no dependencies", () => {
    const plan = planMagis({ title: "x", body: "y" });
    const analysis = plan.sub_issues.find((s) => s.kind === "requirements_analysis")!;
    expect(analysis.depends_on).toEqual([]);
  });
});

describe("planMagis · issue_id + warnings", () => {
  it("slugifies title into issue_id when not provided", () => {
    const plan = planMagis({ title: "Fix Login Redirect Bug", body: "body" });
    expect(plan.issue_id).toBe("magis-fix-login-redirect-bug");
  });

  it("honors explicit issue_id", () => {
    const plan = planMagis({
      title: "long noisy title",
      body: "body",
      issue_id: "custom-123",
    });
    expect(plan.issue_id).toBe("custom-123");
  });

  it("falls back to magis-untitled for all-punctuation titles", () => {
    const plan = planMagis({ title: "!!! ??? ...", body: "body" });
    expect(plan.issue_id).toBe("magis-untitled");
  });

  it("warns when repo_root missing", () => {
    const plan = planMagis({ title: "x", body: "y" });
    expect(plan.warnings.some((w) => w.includes("repo_root"))).toBe(true);
  });

  it("warns when test_command missing", () => {
    const plan = planMagis({ title: "x", body: "y" });
    expect(plan.warnings.some((w) => w.includes("test_command"))).toBe(true);
  });

  it("suppresses warnings when both hints provided", () => {
    const plan = planMagis({
      title: "x",
      body: "y",
      repo_root: "/tmp",
      test_command: "pytest",
    });
    expect(plan.warnings).toEqual([]);
  });
});

describe("planMagis · shared memory + parent body", () => {
  it("scopes shared_memory to magis-lite:{issue_id}", () => {
    const plan = planMagis({ title: "Fix X", body: "body" });
    expect(plan.shared_memory_scope).toBe("magis-lite:magis-fix-x");
  });

  it("parent body enumerates all sub-issues", () => {
    const plan = planMagis({ title: "x", body: "the-body" });
    expect(plan.parent_issue.body).toContain("the-body");
    expect(plan.parent_issue.body).toContain("requirements_analysis");
    expect(plan.parent_issue.body).toContain("code_localization");
    expect(plan.parent_issue.body).toContain("code_edit");
    expect(plan.parent_issue.body).toContain("test_write");
    expect(plan.parent_issue.body).toContain("test_run");
  });

  it("each sub-issue body references shared memory + siblings correctly", () => {
    const plan = planMagis({
      title: "x",
      body: "y",
      repo_root: "/repo",
      test_command: "pytest",
    });
    const custodian = plan.sub_issues.find((s) => s.kind === "code_localization")!;
    expect(custodian.body).toContain("/repo");
    const qaWrite = plan.sub_issues.find((s) => s.kind === "test_write")!;
    expect(qaWrite.body).toContain("pytest");
    const dev = plan.sub_issues.find((s) => s.kind === "code_edit")!;
    expect(dev.body).toContain("candidates");
    expect(dev.body).toContain("analysis");
  });
});

describe("planMagis · adapter + skill suggestions", () => {
  it("developer suggests agentless-triage + stateful-prompt-format", () => {
    const plan = planMagis({ title: "x", body: "y" });
    const dev = plan.sub_issues.find((s) => s.kind === "code_edit")!;
    expect(dev.suggested_skills).toEqual(["agentless-triage", "stateful-prompt-format"]);
  });

  it("QA suggests codex_local adapter", () => {
    const plan = planMagis({ title: "x", body: "y" });
    const qa = plan.sub_issues.find((s) => s.kind === "test_write")!;
    expect(qa.suggested_adapter).toBe("codex_local");
  });
});
