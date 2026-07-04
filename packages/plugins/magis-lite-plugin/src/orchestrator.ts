/**
 * MAGIS-lite orchestrator · M3-02.
 *
 * Given an incoming issue, plans a parent issue + child sub-issues assigned to
 * each of the 4 roles. Sequential dependencies encoded via `depends_on` (kept
 * simple: linear chain manager → repo → dev → qa. Paper allows more parallel
 * fan-out but caveat S8 §0 flags "parallel=1 constraint" — we default to
 * sequential for M3 POC, revisit for M4).
 *
 * Pure function. Actual paperclip issue creation is the caller's job.
 */

import {
  ROLE_REGISTRY,
  type Role,
  type SubIssueKind,
  ownerOfSubIssueKind,
} from "./roles.js";

// ---------------------------------------------------------------------------
// Input / output contracts
// ---------------------------------------------------------------------------

export interface MagisIssueInput {
  /** Free-form issue title. */
  title: string;
  /** Full issue description / body. */
  body: string;
  /** Optional issue id · defaults to slug of title. */
  issue_id?: string;
  /** Repo hint (used to pass through to Repository Custodian). */
  repo_root?: string;
  /** Test framework hint (used by QA). */
  test_command?: string;
}

export interface PlannedSubIssue {
  kind: SubIssueKind;
  role: Role;
  title: string;
  body: string;
  /** Ordered list of sub-issues that must complete before this one. */
  depends_on: SubIssueKind[];
  /** Hint for the caller: which adapter to hire this role with. */
  suggested_adapter: string;
  /** Hint: which skills to load. */
  suggested_skills: string[];
}

export interface MagisPlan {
  issue_id: string;
  parent_issue: {
    title: string;
    body: string;
  };
  sub_issues: PlannedSubIssue[];
  /** Shared memory namespace for plugin_state · scoped by issue_id. */
  shared_memory_scope: string;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Plan a MAGIS-lite decomposition for a single issue.
 * Sequential fanout: manager → repository_custodian → developer → qa.
 *
 * Sequential-only because MAGIS paper §parallelism caveat is unresolved (S8 §0
 * "🟡 有条件可行"). M3 POC accepts lower ceiling; M4 can revisit for parallel.
 */
export function planMagis(input: MagisIssueInput): MagisPlan {
  const issue_id = normalizeIssueId(input);
  const warnings: string[] = [];

  const analysisSubIssue: PlannedSubIssue = {
    kind: "requirements_analysis",
    role: ownerOfSubIssueKind("requirements_analysis"),
    title: `[Manager] Analyze: ${input.title}`,
    body: renderManagerBody(input),
    depends_on: [],
    suggested_adapter: ROLE_REGISTRY.manager.suggested_adapter,
    suggested_skills: ROLE_REGISTRY.manager.suggested_skills,
  };

  const localizationSubIssue: PlannedSubIssue = {
    kind: "code_localization",
    role: ownerOfSubIssueKind("code_localization"),
    title: `[Custodian] Localize files for: ${input.title}`,
    body: renderCustodianBody(input),
    depends_on: ["requirements_analysis"],
    suggested_adapter: ROLE_REGISTRY.repository_custodian.suggested_adapter,
    suggested_skills: ROLE_REGISTRY.repository_custodian.suggested_skills,
  };

  const editSubIssue: PlannedSubIssue = {
    kind: "code_edit",
    role: ownerOfSubIssueKind("code_edit"),
    title: `[Developer] Implement: ${input.title}`,
    body: renderDeveloperBody(input),
    depends_on: ["code_localization"],
    suggested_adapter: ROLE_REGISTRY.developer.suggested_adapter,
    suggested_skills: ROLE_REGISTRY.developer.suggested_skills,
  };

  const testWriteSubIssue: PlannedSubIssue = {
    kind: "test_write",
    role: ownerOfSubIssueKind("test_write"),
    title: `[QA] Write reproducer for: ${input.title}`,
    body: renderQaWriteBody(input),
    // Written before the patch is applied · depends on localization to know where
    depends_on: ["code_localization"],
    suggested_adapter: ROLE_REGISTRY.qa.suggested_adapter,
    suggested_skills: ROLE_REGISTRY.qa.suggested_skills,
  };

  const testRunSubIssue: PlannedSubIssue = {
    kind: "test_run",
    role: ownerOfSubIssueKind("test_run"),
    title: `[QA] Run tests after patch: ${input.title}`,
    body: renderQaRunBody(input),
    depends_on: ["code_edit", "test_write"],
    suggested_adapter: ROLE_REGISTRY.qa.suggested_adapter,
    suggested_skills: ROLE_REGISTRY.qa.suggested_skills,
  };

  const sub_issues: PlannedSubIssue[] = [
    analysisSubIssue,
    localizationSubIssue,
    editSubIssue,
    testWriteSubIssue,
    testRunSubIssue,
  ];

  if (!input.repo_root) warnings.push("no repo_root · Repository Custodian must probe workspace");
  if (!input.test_command) warnings.push("no test_command · QA will fall back to autodetect");

  return {
    issue_id,
    parent_issue: {
      title: `MAGIS · ${input.title}`,
      body: buildParentBody(input, sub_issues),
    },
    sub_issues,
    shared_memory_scope: `magis-lite:${issue_id}`,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Body renderers (per role)
// ---------------------------------------------------------------------------

function renderManagerBody(input: MagisIssueInput): string {
  return `## Role: Manager

You are the Manager in a MAGIS-lite 4-agent org. Your job is to:
1. Read the issue and identify the correct decomposition.
2. Delegate to Repository Custodian (localization), Developer (edit), QA (test).
3. Aggregate results and produce a summary decision.

## Issue
Title: ${input.title}

Body:
${input.body}

## Shared memory
All roles share \`plugin_state\` scoped to \`magis-lite:{issue_id}\`. Write:
- \`analysis\`: your summary of the issue and decomposition plan
- \`sign_off\`: your final decision after all sub-issues close
`;
}

function renderCustodianBody(input: MagisIssueInput): string {
  return `## Role: Repository Custodian

You are the Repository Custodian. Your job is to:
1. Read the Manager's analysis from shared memory (\`plugin_state.analysis\`).
2. Localize the code — identify the top 3-5 files most likely involved.
3. DO NOT edit code. That's Developer's job.

## Repo root
${input.repo_root ?? "(unknown · probe the workspace cwd)"}

## Sibling memory
- \`analysis\` (from Manager)

## Emit
Write to shared memory:
- \`candidates\`: array of { path, why } for top 3-5 files
`;
}

function renderDeveloperBody(input: MagisIssueInput): string {
  return `## Role: Developer

You are the Developer. Your job is to:
1. Read \`candidates\` from shared memory (populated by Repository Custodian).
2. Write a minimal patch that fixes the issue described in \`analysis\`.
3. Coordinate with QA — do NOT skip test_write (QA writes the reproducer BEFORE your patch is applied).

## Issue reference
${input.title}

## Sibling memory
- \`analysis\` (Manager) + \`candidates\` (Custodian) + \`reproducer_test\` (QA test_write, read-only)

## Emit
Write to shared memory:
- \`patch\`: unified diff
`;
}

function renderQaWriteBody(input: MagisIssueInput): string {
  return `## Role: QA · Reproducer Writing

You are QA writing the reproducer. Do this BEFORE the Developer's patch is applied.

Your job:
1. Read \`analysis\` and \`candidates\` from shared memory.
2. Write a failing test that demonstrates the bug described in the issue.
3. Ensure the test is deterministic (no flaky sleeps, no order dependencies).

## Test command hint
${input.test_command ?? "(autodetect · look for pytest / npm test / cargo test)"}

## Emit
Write to shared memory:
- \`reproducer_test\`: { path, source } of the new test
`;
}

function renderQaRunBody(input: MagisIssueInput): string {
  return `## Role: QA · Post-Patch Verification

You are QA running tests after the Developer applied their patch.

Your job:
1. Read \`patch\` and \`reproducer_test\` from shared memory.
2. Apply the patch, run the full test suite (+ the reproducer specifically).
3. Emit a verdict.

## Test command
${input.test_command ?? "(autodetect)"}

## Emit
Write to shared memory:
- \`verdict\`: one of \`pass\` / \`fail_code\` / \`fail_infra\` / \`retry\`
- \`test_output_tail\`: last 50 lines
`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildParentBody(input: MagisIssueInput, subs: PlannedSubIssue[]): string {
  const lines = [
    "## Original issue",
    input.body,
    "",
    "## MAGIS-lite decomposition (sequential)",
    ...subs.map(
      (s) => `- [${s.kind}] ${s.role} → ${s.title} (depends_on: ${s.depends_on.join(", ") || "-"})`,
    ),
    "",
    "## Shared memory",
    "All 4 roles read/write plugin_state scoped to this issue's `magis-lite:{issue_id}` namespace.",
  ];
  return lines.join("\n");
}

function normalizeIssueId(input: MagisIssueInput): string {
  if (input.issue_id && input.issue_id.trim().length > 0) return input.issue_id.trim();
  const slug = input.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug.length > 0 ? `magis-${slug}` : "magis-untitled";
}
