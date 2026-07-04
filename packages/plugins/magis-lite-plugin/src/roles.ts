/**
 * MAGIS-lite role hierarchy · M3-02.
 *
 * 4 roles from the MAGIS paper (arxiv 2403.17927). Faithful to the paper's
 * role responsibilities · lightweight vs full MetaGPT (which has 8+ roles).
 *
 * The `reports_to` relationship encodes the org tree Manager sits at the root
 * · Repository Custodian + Developer + QA are peers reporting to Manager.
 * This matches the paper Fig 2 · not a strict tree in the tool sense but a
 * DAG with a single ceiling.
 */

export const ROLES = [
  "manager",
  "repository_custodian",
  "developer",
  "qa",
] as const;

export type Role = (typeof ROLES)[number];

export interface RoleSpec {
  role: Role;
  displayName: string;
  responsibility: string;
  reports_to: Role | null;
  /** Suggested paperclip adapter type for this role. */
  suggested_adapter: string;
  /** Suggested skills to hire this role with. */
  suggested_skills: string[];
  /** Which sub-issue kinds this role owns (from orchestrator planning). */
  owns_sub_issue_kinds: SubIssueKind[];
}

export type SubIssueKind =
  | "requirements_analysis"
  | "code_localization"
  | "code_edit"
  | "test_write"
  | "test_run";

export const ROLE_REGISTRY: Record<Role, RoleSpec> = {
  manager: {
    role: "manager",
    displayName: "Manager",
    responsibility:
      "Decompose the incoming issue into sub-issues · assign to the right role · aggregate final result",
    reports_to: null,
    suggested_adapter: "claude_local",
    suggested_skills: [],
    owns_sub_issue_kinds: ["requirements_analysis"],
  },
  repository_custodian: {
    role: "repository_custodian",
    displayName: "Repository Custodian",
    responsibility:
      "Own repo structure knowledge · answer 'where does this feature live' via cognee / codebase-memory-mcp · never edit code directly",
    reports_to: "manager",
    suggested_adapter: "claude_local",
    suggested_skills: ["codebase-memory-mcp"],
    owns_sub_issue_kinds: ["code_localization"],
  },
  developer: {
    role: "developer",
    displayName: "Developer",
    responsibility:
      "Given localized files + repair intent · write minimal patch · own the code_edit sub-issue kind",
    reports_to: "manager",
    suggested_adapter: "claude_local",
    suggested_skills: ["agentless-triage", "stateful-prompt-format"],
    owns_sub_issue_kinds: ["code_edit"],
  },
  qa: {
    role: "qa",
    displayName: "QA",
    responsibility:
      "Write reproducers before the patch · run tests after · block merge if regressions",
    reports_to: "manager",
    suggested_adapter: "codex_local",
    suggested_skills: ["code-reviewer"],
    owns_sub_issue_kinds: ["test_write", "test_run"],
  },
};

// ---------------------------------------------------------------------------
// Hierarchy helpers
// ---------------------------------------------------------------------------

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function getSubordinates(role: Role): Role[] {
  return ROLES.filter((r) => ROLE_REGISTRY[r].reports_to === role);
}

export function getChainOfCommand(role: Role): Role[] {
  const chain: Role[] = [];
  let current: Role | null = role;
  while (current !== null) {
    chain.push(current);
    current = ROLE_REGISTRY[current].reports_to;
  }
  return chain;
}

export function ownerOfSubIssueKind(kind: SubIssueKind): Role {
  for (const role of ROLES) {
    if (ROLE_REGISTRY[role].owns_sub_issue_kinds.includes(kind)) return role;
  }
  // Fallback to manager (owns anything unclassified — matches the paper's
  // "buck stops with Manager" convention).
  return "manager";
}
