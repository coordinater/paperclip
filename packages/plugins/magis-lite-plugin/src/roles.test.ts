import { describe, expect, it } from "vitest";
import {
  ROLES,
  ROLE_REGISTRY,
  getChainOfCommand,
  getSubordinates,
  isRole,
  ownerOfSubIssueKind,
} from "./roles.js";

describe("role registry", () => {
  it("declares 4 canonical roles", () => {
    expect(ROLES).toEqual(["manager", "repository_custodian", "developer", "qa"]);
  });

  it("manager is the root (reports_to null)", () => {
    expect(ROLE_REGISTRY.manager.reports_to).toBe(null);
  });

  it("all non-manager roles report to manager", () => {
    for (const role of ROLES) {
      if (role === "manager") continue;
      expect(ROLE_REGISTRY[role].reports_to).toBe("manager");
    }
  });

  it("each role has a suggested_adapter", () => {
    for (const role of ROLES) {
      expect(ROLE_REGISTRY[role].suggested_adapter).toBeTruthy();
    }
  });

  it("QA uses codex_local (distinct from other Claude-based roles)", () => {
    expect(ROLE_REGISTRY.qa.suggested_adapter).toBe("codex_local");
  });
});

describe("isRole", () => {
  it("accepts canonical roles", () => {
    expect(isRole("manager")).toBe(true);
    expect(isRole("qa")).toBe(true);
  });
  it("rejects unknown roles", () => {
    expect(isRole("architect")).toBe(false);
    expect(isRole("")).toBe(false);
    expect(isRole(42)).toBe(false);
  });
});

describe("getSubordinates", () => {
  it("returns 3 for manager", () => {
    expect(getSubordinates("manager").sort()).toEqual([
      "developer",
      "qa",
      "repository_custodian",
    ]);
  });
  it("returns [] for non-manager roles", () => {
    expect(getSubordinates("developer")).toEqual([]);
    expect(getSubordinates("qa")).toEqual([]);
  });
});

describe("getChainOfCommand", () => {
  it("QA → Manager", () => {
    expect(getChainOfCommand("qa")).toEqual(["qa", "manager"]);
  });
  it("Manager → itself only", () => {
    expect(getChainOfCommand("manager")).toEqual(["manager"]);
  });
  it("Repository Custodian → Manager", () => {
    expect(getChainOfCommand("repository_custodian")).toEqual([
      "repository_custodian",
      "manager",
    ]);
  });
});

describe("ownerOfSubIssueKind", () => {
  it("maps each canonical sub_issue kind to the correct owner", () => {
    expect(ownerOfSubIssueKind("requirements_analysis")).toBe("manager");
    expect(ownerOfSubIssueKind("code_localization")).toBe("repository_custodian");
    expect(ownerOfSubIssueKind("code_edit")).toBe("developer");
    expect(ownerOfSubIssueKind("test_write")).toBe("qa");
    expect(ownerOfSubIssueKind("test_run")).toBe("qa");
  });
});
