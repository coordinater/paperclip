# Agentless issue-tree template · M4-04 upgrade

**Purpose**: turn the 3-step Agentless workflow into a Paperclip-native
**issue tree** so each step becomes an addressable, checkoutable, auditable
sub-issue rather than three prompts hidden inside one adapter run.

**When to use this mode vs "single-adapter mode"** (original skill):

| Mode | Use when | Trade-off |
|---|---|---|
| **Mode A · single-adapter** (original) | Fast SWE-bench sweep; disposable one-shot triage; no downstream approval gate needed | Cheap; whole flow lives inside one adapter run; no audit granularity |
| **Mode B · issue-tree** (this file) | Real project issue; downstream `hire_reviewer` / human validation gate needed; want per-step activity_log + checkout attribution + budget attribution | 3× create/checkout/close overhead; each child gets its own `activity_log` chain |

**Both modes share** the same three-prompt cores (`step-1-localize.md` /
`step-2-repair.md` / `step-3-validate.md`) — Mode B just wraps them as sub-issues.

---

## Tree shape

```
parent issue  (type='feature' · title="Agentless: <original title>")
    │
    ├── child #1  localize    (assigneeAgent = <deep-swe or fast-fix>)
    │       └── output → parent shared plugin_state `agentless:{parent_id}.candidates`
    │
    ├── child #2  repair      (assigneeAgent = <deep-swe>)
    │       └── blockedBy = [child #1]
    │       └── output → shared plugin_state `agentless:{parent_id}.patch`
    │
    └── child #3  validate    (assigneeAgent = <deep-swe> · runs tests)
            └── blockedBy = [child #2]
            └── on completion → **issue_approvals gate** (see approval-gate.md)
            └── output → shared plugin_state `agentless:{parent_id}.verdict`
```

**Shared memory scope**: `agentless:{parent_id}` — same convention as MAGIS-lite
plugin's `magis-lite:{issue_id}` (M3-02 · D-M3-04). Each child reads siblings'
outputs from this namespace, doesn't re-derive.

**Sequential dependencies**: strict chain via `blockedByIssueIds` (localize →
repair → validate). No parallelism (matches original Agentless paper — sequential
is the point).

---

## Spawn recipe (adapter-facing pseudocode)

The adapter or driving agent creates the tree via `ctx.issues.create` calls (SDK
`PluginIssuesClient.create` — see `packages/plugins/sdk/src/types.ts` §1332).

```ts
// 1. parent (feature)
const parent = await ctx.issues.create({
  companyId,
  title: `Agentless: ${originalTitle}`,
  description: buildParentBody(originalIssue),      // see below
  status: "open",
  originKind: "plugin.agentless-triage",
  originId: originalIssueId ?? null,
  labelIds: [/* optional agentless label */],
});

// 2. child · localize
const localize = await ctx.issues.create({
  companyId,
  parentId: parent.id,
  title: `[Agentless #1] Localize files for: ${originalTitle}`,
  description: renderLocalizeBody(originalIssue, parent.id),
  status: "open",
  assigneeAgentId: candidateAdapterAgentId,          // e.g. `fast-fix`
  originKind: "plugin.agentless-triage.localize",
  originId: parent.id,
});

// 3. child · repair (blocked by localize)
const repair = await ctx.issues.create({
  companyId,
  parentId: parent.id,
  title: `[Agentless #2] Repair patch for: ${originalTitle}`,
  description: renderRepairBody(originalIssue, parent.id),
  status: "open",
  assigneeAgentId: developerAdapterAgentId,          // e.g. `deep-swe`
  blockedByIssueIds: [localize.id],
  originKind: "plugin.agentless-triage.repair",
  originId: parent.id,
});

// 4. child · validate (blocked by repair) → will trigger approval on close
const validate = await ctx.issues.create({
  companyId,
  parentId: parent.id,
  title: `[Agentless #3] Validate patch for: ${originalTitle}`,
  description: renderValidateBody(originalIssue, parent.id),
  status: "open",
  assigneeAgentId: developerAdapterAgentId,
  blockedByIssueIds: [repair.id],
  originKind: "plugin.agentless-triage.validate",
  originId: parent.id,
});
```

**Note on `originKind`**: prefix `plugin.agentless-triage.*` makes the tree
queryable later via `ctx.issues.list({ originKindPrefix: "plugin.agentless-triage" })`
— that is the audit view.

**Note on `assigneeAgentId`**: the calling adapter picks who owns each child.
Default: reuse the same agent id for all three (single-adapter shape); if a
codex-style `fast-fix` is available, use it for `localize` (cheaper, wider
context) and `deep-swe` for `repair` + `validate`. This choice is left to the
caller — the skill only defines the tree shape.

---

## Body renderers (parent + 3 children)

### Parent

```
## Original issue
{issue_body}

## Agentless issue-tree (M4-04)
- [localize] child #{localize_id} · candidates → shared memory
- [repair]   child #{repair_id}   · unified diff → shared memory (blockedBy: #{localize_id})
- [validate] child #{validate_id} · apply + run tests + emit verdict → shared memory (blockedBy: #{repair_id})

## Approval gate
The `validate` child closes with `verdict: pass` → auto-request a `hire_reviewer` approval
on the *parent* before merging. See `references/approval-gate.md`.

## Shared memory scope
All 3 children read/write plugin_state scoped to `agentless:{parent_id}`.
Keys:
- candidates   (written by #1, read by #2 + #3)
- patch        (written by #2, read by #3)
- verdict      (written by #3, read by parent's reviewer)
```

### Localize child body

```
You are the Agentless step-1 Localizer. Follow `references/step-1-localize.md`
verbatim on the parent issue's body.

## Emit
Write to shared memory `agentless:{parent_id}.candidates`:
- shape: `{"candidates": ["path/to/file1.py", ...]}` (top 5)
Then close this child issue with `status: closed`.
Sibling `repair` will unblock automatically.

## Retry contract
If output is not valid JSON or fewer than 2 candidates, retry step-1 with tighter prompt.
Max 3 retries. If still failing, close with `verdict: localize_failed` and escalate to
parent via a comment.
```

### Repair child body

```
You are the Agentless step-2 Repairer. Follow `references/step-2-repair.md`
verbatim.

## Read
- shared memory `agentless:{parent_id}.candidates` (from Localize)
- file contents of each candidate

## Emit
Write to shared memory `agentless:{parent_id}.patch`:
- shape: unified diff (git-apply-able)
Then close this child issue.

## Retry contract
If `git apply --check` fails, retry with feedback max 3 times. If still failing,
close with `verdict: repair_failed` and escalate to parent.
```

### Validate child body

```
You are the Agentless step-3 Validator. Follow `references/step-3-validate.md`
verbatim.

## Read
- shared memory `agentless:{parent_id}.patch` (from Repair)
- shared memory `agentless:{parent_id}.candidates` (from Localize · context only)

## Emit
Write to shared memory `agentless:{parent_id}.verdict`:
- `pass`         → tests all green after patch applied → **REQUEST APPROVAL** (see approval-gate.md)
- `fail_code`    → tests fail with clear error → escalate to parent for loop-back
- `fail_infra`   → import missing / env broken → escalate; do NOT loop
- `retry`        → need one more localize/repair pass (parent decides)

## Approval gate
On `pass`, before closing, create a `hire_reviewer` approval on the PARENT issue
(not on this child) so the reviewer can see the whole tree. Wait for approval decision.
- approved → close self + close parent · emit final result
- rejected → escalate to parent with the reviewer's comment; parent may spawn a new
             localize/repair/validate triple (loop iteration 2)

## Loop budget
Parent issue tracks `iteration` counter in shared memory (`agentless:{parent_id}.iteration`).
Max 3 iterations. Fourth loop → close parent as `RESULT: timeout`.
```

---

## Loop iteration (parent-level)

Unlike Mode A (loop inside single adapter run), Mode B loops at the **parent
issue level**: when a validate child reports `fail_code` or a rejected
approval, the parent spawns a new triple of children with an incremented
iteration counter. Each iteration is fully audited (own activity_log chain,
own checkout attribution, own budget draw).

**Iteration budget**: max 3 full triples spawned per parent issue. On the 4th
attempt, the parent closes with `RESULT: timeout` — matches Mode A's budget.

---

## Cross-references

- Original skill flow: `../SKILL.md` §"The three steps"
- Prompt templates (reused verbatim): `step-1-localize.md` / `step-2-repair.md` / `step-3-validate.md`
- Approval gate wire-up: `./approval-gate.md`
- MAGIS-lite pattern (multi-child issue-tree · shared memory scope): `packages/plugins/magis-lite-plugin/src/orchestrator.ts`
- SDK issue APIs: `packages/plugins/sdk/src/types.ts` §PluginIssuesClient (line 1332)
- Handbook: `handoff/05-施工手册-M3+.md` §M4-04
