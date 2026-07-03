# Template · State `failed`

**Purpose**: Verify failed with a code error. Prompt guides the agent to reason about WHY, and prepare a corrective loop back to state `open` (with augmented context) or `localized` (with an updated patch approach).

**Emit this template when**: derived `fsm_state = 'failed'` (see SKILL.md).

**Behavior**: This template is the "learning loop" of the FSM. Every retry should extract signal from the failure.

---

## Prompt template (copy-paste, substitute `{...}` slots)

```
You are analyzing a verify failure. The previous patch didn't fix the bug
(or introduced a new failure). Your job is to REASON about the failure and
DECIDE the next FSM transition.

Issue title: {issue_title}
Issue body:
---
{issue_body}
---

Retry count: {retry_count} of 3 max

Previous candidates (state `open`):
{candidates}

Previous patch (state `patched`):
---
{previous_patch}
---

Verify output showing failure:
---
{test_output_tail}
---

Instructions:
1. Read the test output carefully. Identify the FAILURE TYPE:
   - wrong_file: candidates didn't contain the actual buggy code (test error
     points at a file not in candidates)
   - wrong_fix: candidates were right but the patch is incorrect (test error
     points at logic inside the patched file)
   - unrelated_regression: patch broke something unrelated (a different test
     started failing)
   - flaky_test: test infra is flaky (intermittent failure; hard to prove
     without rerunning)
2. Decide the next transition:
   - back_to_open: reset candidates (localization was wrong). Provide new
     candidate hints in `needed_files`.
   - retry_patch: candidates OK, retry state `localized` with feedback.
     Provide guidance for the next patch attempt.
   - escalate: this is beyond automated repair (spec ambiguity, environmental
     complexity, needs human).

Output format (strict JSON):
{
  "action": "diagnosed",
  "failure_type": "wrong_file" | "wrong_fix" | "unrelated_regression" | "flaky_test",
  "next_state": "open" | "localized" | "human_help_requested",
  "needed_files": ["..."]  // populated iff next_state == "open" and failure_type == "wrong_file"
  "patch_guidance": "..."  // populated iff next_state == "localized"; one paragraph on what to try
  "escalation_reason": "..."  // populated iff next_state == "human_help_requested"
}
```

---

## FSM transition after this template

- `next_state == "open"` → caller sets `issue_documents/fsm_state = "open"` + augments candidate list with `needed_files`; re-invokes state-open template
- `next_state == "localized"` → caller sets `issue_documents/fsm_state = "localized"` + appends `patch_guidance` to the next repair prompt; re-invokes state-localized template
- `next_state == "human_help_requested"` → caller creates a Paperclip approval `type='human_help_requested'` with `escalation_reason`; FSM halts

## Budget check

The **caller** enforces `retry_count >= 3` → force `next_state = "human_help_requested"` regardless of what this template returned. Never let the FSM loop forever.
