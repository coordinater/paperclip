---
name: stateful-prompt-format
description: >
  RepairAgent-style FSM prompt skill: read issue.status (or a persisted
  fsm_state key from issue_documents), pick the matching prompt template
  (open / localized / patched / failed), and emit it for the caller.
  Prevents infinite loops with max_retries=3 and a retry_count key persisted
  in issue_documents. Use this skill when an agent needs different guidance
  at different stages of a repair loop (initial analysis → patch → verify →
  fix-forward on failure). Trigger with `/stateful-prompt-format` or when
  paperclip issue.status changes.
---

# Stateful Prompt Format (RepairAgent FSM) Skill

Adapted from the **RepairAgent** paper's FSM idea (arxiv 2306.17077): instead of one all-purpose prompt, use a finite state machine where each state has a **purpose-built prompt template**. Transitions are driven by the issue's lifecycle.

**Design principle**: prompts are tools, not monoliths. Switch tools when the job changes.

## FSM diagram

```
                                    ┌──────────────────────────────────────────┐
                                    │                                          │
    open ──────► localized ──────► patched ──────► (success / issue closed)
                                    │
                                    │  verify failed
                                    ▼
                                  failed ──────► open (retry with feedback)
                                    │
                                    │  retry_count >= max_retries
                                    ▼
                               human_help_requested (escalation)
```

## When to use

- Paperclip issue in a repair loop needs different prompts at different stages
- Verifier signal (test pass/fail) drives state transitions
- Want to bound iteration count to prevent runaway
- Want each stage's prompt to be independently editable / refinable

## When NOT to use

- Single-shot task with no verify step (use a plain skill)
- No test suite / no verifier signal (FSM has nothing to transition on)
- Stateless request-response API integrations (no lifecycle to model)

## Inputs

The skill reads from Paperclip context:

- `issue.status` (Paperclip standard: `open` / `in_progress` / `awaiting_review` / `closed`)
- `issue_documents(key='fsm_state')` — custom FSM state override; if present, wins over `issue.status`. Values: `open` / `localized` / `patched` / `failed`.
- `issue_documents(key='retry_count')` — integer, defaults to 0

**State derivation rule** (in order):
1. If `fsm_state` document exists → use its value directly
2. Else if `issue.status == 'awaiting_review'` and a `patch_url` exists in `issue_documents` → derive `patched`
3. Else if `issue.status == 'in_progress'` and a `candidates` list exists → derive `localized`
4. Else if `issue.status == 'in_progress'` and a `failed_verify` document exists → derive `failed`
5. Otherwise → `open`

## Output

The skill emits a **single prompt template** (as a string) chosen from one of:

- `references/template-open.md` — no localization done yet
- `references/template-localized.md` — files identified, ready to generate patch
- `references/template-patched.md` — patch written, ready to verify
- `references/template-failed.md` — verify failed, need to loop back

## Iteration budget

- Read `retry_count` from `issue_documents`
- If `retry_count >= 3` → do NOT emit a template. Instead:
  - Write an `escalation` document `{ reason: "max_retries_exhausted", retry_count }`
  - Return a special "escalate to human" signal
- Otherwise: emit the state's template; the caller is responsible for incrementing `retry_count` after each `failed` → `open` transition

## Integration with Paperclip

- **State reads**: `GET /api/companies/:cid/issues/:iid/documents?keys=fsm_state,retry_count,candidates,failed_verify,patch_url`
- **State writes** (by caller, not this skill):
  - After localize step: `PUT documents/fsm_state` = `"localized"` + `PUT documents/candidates` = `[...]`
  - After patch step: `PUT documents/fsm_state` = `"patched"` + `PUT documents/patch_url` = `"..."`
  - After verify pass: `PUT documents/fsm_state` = `"closed"` (or issue.status→'closed')
  - After verify fail: `PUT documents/fsm_state` = `"failed"` + `PUT documents/failed_verify` = `{...}`  + `PUT documents/retry_count` = `retry_count + 1`
- Emits `activity_log` entry `agent_skill_ran` with details: `{ state, retry_count, template_used }`

## Composition with sibling skills

- Downstream: `agentless-triage` (M2 W5-D2) can consume the `open`/`localized`/`patched`/`failed` templates from this skill instead of hard-coding its own step-1/2/3 prompts
- Upstream: `code-review` (M1 W4-D1) may trigger `patched` → HITL approval → transition to `closed`
- Adapter agnostic: any adapter (`claude_local`, `mini_swe_local`, `swe_agent_local`) can use this skill

## References

- `references/template-open.md`
- `references/template-localized.md`
- `references/template-patched.md`
- `references/template-failed.md`
- Origin: RepairAgent paper (arxiv 2306.17077)
- Handbook: `handoff/04-施工手册-M2.md` §W6.D2
- Composes with: `agentless-triage` (`skills/agentless-triage/`)
