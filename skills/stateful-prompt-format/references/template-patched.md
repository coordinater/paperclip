# Template · State `patched`

**Purpose**: A patch is written. Prompt guides the agent to run tests and decide pass/fail. Mostly mechanical (shell), but the classification step benefits from LLM help when output is ambiguous.

**Emit this template when**: derived `fsm_state = 'patched'` (see SKILL.md).

**Suggested downstream skill**: `agentless-triage` step-3-validate.

---

## Prompt template (copy-paste, substitute `{...}` slots)

```
You are verifying a patch. The patch is already applied to the working tree.
Your job is to RUN THE TESTS and CLASSIFY the outcome.

Issue title: {issue_title}
Patch:
---
{patch}
---
Applied to repo: {repo_root}

Test command to run: {test_command}
Test timeout: {test_timeout_seconds}s

Instructions:
1. Run `{test_command}` from `{repo_root}` with a {test_timeout_seconds}s timeout.
2. Collect exit code + last 200 lines of combined stdout+stderr.
3. Classify:
   - pass: exit code 0 AND no lines matching /FAIL|ERROR|Traceback/ in tail
   - fail_code: exit code != 0 AND output shows assertion failures / relevant
     test failures / tracebacks pointing at the patched code
   - fail_infra: exit code != 0 AND output shows ModuleNotFoundError /
     command not found / permission errors / network errors
   - fail_ambiguous: exit code != 0 but output doesn't clearly fit either.
     Prefer fail_code when in doubt (safer to iterate than to give up).

Output format (strict JSON):
{
  "action": "verified",
  "verdict": "pass" | "fail_code" | "fail_infra",
  "exit_code": <int>,
  "test_output_tail": "<last 50 lines>",
  "reason": "<one-sentence explanation of the verdict>"
}
```

---

## FSM transition after this template

- `verdict == "pass"` → caller writes `issue_documents/fsm_state = "closed"` (or transitions `issue.status` to `awaiting_review` for HITL); triggers `code-review` (M1 W4-D1) or approval
- `verdict == "fail_code"` → caller writes `issue_documents/fsm_state = "failed"` + `issue_documents/failed_verify = {...}` + increments `retry_count`; re-invokes state-failed template
- `verdict == "fail_infra"` → caller writes `issue_documents/fsm_state = "human_help_requested"` (don't loop — infra issues don't fix by patch iteration); escalates to human with the error
