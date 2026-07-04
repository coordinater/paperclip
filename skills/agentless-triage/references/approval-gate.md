# Agentless issue-tree · validation approval gate

**Purpose**: after step-3 validate reports `pass`, do NOT auto-close the parent.
Instead trigger a **`hire_reviewer` approval** on the parent so a human (or
downstream code-review skill) signs off before the patch is considered final.

**Why gate here, not inside step-3**:
- step-3 sees only test output — it can miss regressions the tests don't cover
- separate approval preserves the "AI proposes, human/second-AI disposes" pattern
- fits Paperclip's `issue_approvals` primitive without new schema

---

## Trigger sequence

```
validate child · status = closed with verdict=pass
        │
        ▼
parent's shared memory `agentless:{parent_id}.verdict` = "pass"
        │
        ▼
adapter (or orchestrator) creates approval on PARENT issue:
    type: "hire_reviewer"
    metadata: {
      source: "plugin.agentless-triage",
      candidates: [ ... ],            // from step-1 output
      patch_summary: "...",           // first 200 chars of diff
      test_output_tail: "...",        // last 50 lines
      iteration: 1
    }
        │
        ▼
parent status → pending_approval  (paperclip handles this transition automatically
                                    once an open approval exists on the issue)
        │
        ▼
board / user reviews via UI or飞书 (paperclip-plugin-lark card)
        │
        ┌────────────────┴────────────────┐
        │                                 │
        ▼                                 ▼
     APPROVED                          REJECTED
        │                                 │
        ▼                                 ▼
close parent with RESULT: pass       parent stays open · comment carries reject reason
                                           │
                                           ▼
                                     if iteration < 3 → spawn new triple (localize/repair/validate)
                                                       with augmented context (reject reason + prior patch)
                                     if iteration = 3 → close with RESULT: rejected_after_max_retries
```

---

## Reuse: `code-review` skill (M1 W4-D1)

The Agentless issue-tree approval gate should **defer to the `code-review`
skill** when it is registered (which it is in this fork, per M1 W4-D1 /
DEV-5). Flow:

1. approval on parent is created with type `hire_reviewer`
2. Paperclip's approval router (D-M2-13 approval-router pattern) matches
   `type=hire_reviewer + source=plugin.agentless-triage` → auto-hire a
   `code-review` adapter agent
3. `code-review` skill runs on the patch (reads shared memory
   `agentless:{parent_id}.patch`) and emits `approve` / `request_changes` /
   `reject`
4. `approve` → parent closes with pass · `request_changes` → parent re-opens
   localize/repair/validate loop with review comments as extra context ·
   `reject` → parent closes with failure

**Fallback**: if `code-review` skill unavailable (e.g. pending approval per
Pattern-5 — 4 pending as of M3), approval waits for human decision instead.

---

## Approval creation surface

**As of M3-M4**: the plugin SDK exposes `PluginIssueApprovalSummary` as a
read view (`ctx.issues.get(...).approvals`) but does NOT expose a
`ctx.approvals.create(...)` primitive (see `packages/plugins/sdk/src/types.ts`
grep `approval` — only summary types + orchestration read model).

**Current workaround** (matches DEV-1 pattern — server route mount is the
sanctioned bridge until SDK adds `ctx.api.register`):

- The `paperclip-plugin-lark` adapter (M1 W3-4) already knows how to trigger
  approvals via the paperclip approvals table when it receives a
  card-based confirm (`larkPostApprovalCard` per DEV-4)
- Agentless issue-tree's validate child adds a comment to the parent
  requesting the approval — the actual approval row is inserted by
  paperclip's approval-router (D-M2-13) which listens for `hire_reviewer`
  intent markers in issue comments

**Comment convention** (parseable by approval-router):

```
<!-- paperclip:approval-request
type: hire_reviewer
source: plugin.agentless-triage
child_issue: {validate_child_id}
iteration: {n}
-->
```

The approval-router (M2 W8-D4 · `packages/plugins/ai-company/api/experimental/approval-router/`)
parses this and creates the row.

**Future**: when SDK adds `ctx.approvals.create()`, this indirection collapses
to a single call. Tracked as `revisit_trigger` in DEV-1.

---

## Retry loop after rejection

When reviewer rejects with `request_changes`:

1. Parent shared memory `agentless:{parent_id}.iteration` increments by 1
2. Parent adds an "augmented context" block to a new-triple spawn:
   - prior patch (from `.patch`)
   - reviewer's rejection comment
   - test output tail (from `.verdict`)
3. Spawn new `[Agentless #1] Localize (iteration 2)` etc. with `blockedBy` unchanged
   from parent structure but tagged `iteration=2` in `originId`
4. Repeat until iteration = 3 · after that close parent with
   `RESULT: rejected_after_max_retries` and escalate to `human_help_requested`
   approval type (rather than another `hire_reviewer`)

**Idempotency**: the child's `title` includes `(iteration N)` suffix so the
audit view can distinguish loops. Shared memory keys stay stable (`candidates`
/ `patch` / `verdict`) — each loop overwrites the previous — but the parent
keeps an `iteration_log` array with `{iteration, patch_sha, verdict, reject_reason}`
for the reviewer.

---

## Cross-references

- Tree spawn recipe: `./issue-tree-template.md`
- Original skill workflow: `../SKILL.md`
- Approval-router (M2 W8-D4): `packages/plugins/ai-company/api/experimental/approval-router/`
- code-review skill source: `wshobson/agents` (M1 W4-D1 · DEV-5)
- Lark approval card (fallback when reviewer route stalls): `paperclip-plugin-lark/worker/src/lark-client.ts` · `larkPostApprovalCard`
- SDK surface: `packages/plugins/sdk/src/types.ts` §PluginIssueApprovalSummary (line 1216)
- DEV-1 rationale for server-route bridge: `handoff/reports/deviations.md` DEV-1
