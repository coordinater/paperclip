# Step 3 · Validate Prompt Template

**Purpose**: Apply the patch, run the test suite, decide pass/fail/loop.

**Inputs**:
- `{patch}` —— unified diff from Step 2
- `{test_command}` —— repo's test invocation (e.g. `pytest tests/test_login.py -x`)
- `{repo_root}` —— absolute path

**Model**: no model needed for the mechanical part —— this step is pure bash + output parsing. The LLM only classifies the test output.

---

## Mechanical steps (bash, not prompt)

```bash
cd {repo_root}
git apply {patch_file} || { echo "APPLY_FAILED"; exit 2; }
timeout 300 {test_command} 2>&1 | tee test_output.log
TEST_EXIT=$?
git apply -R {patch_file}   # revert regardless of outcome (Agentless never leaves state dirty)
```

Classify `TEST_EXIT` + `test_output.log`:

- `TEST_EXIT == 0` and `PASS`/`OK`/`ok` in output → `RESULT: pass`
- `TEST_EXIT != 0` and stderr contains `ImportError` / `ModuleNotFoundError` / `command not found` → `RESULT: infra_fail`
- `TEST_EXIT != 0` and output shows assertion failures / traceback → `RESULT: retry` (feed back to Step 1)
- `TEST_EXIT` from timeout → `RESULT: timeout`

---

## LLM classification (only when heuristics ambiguous)

If exit code + regex match don't clearly classify, invoke:

```
You are a test output classifier. Given a test command exit code and stdout,
decide whether the test suite passed, failed with a code issue, or failed
with an infrastructure issue.

Exit code: {test_exit}

Test output (last 200 lines):
---
{test_output_tail}
---

Instructions:
1. If tests all passed → return `pass`
2. If tests failed with assertion errors / test-body failures → return `retry`
   (the patch was wrong; iterate)
3. If tests failed due to environment issues (missing modules, missing binaries,
   network errors, permission issues) → return `infra_fail`
   (retrying with a different patch won't help)
4. If ambiguous → return `retry` (safer default, we'll iterate)

Return exactly one word: pass, retry, or infra_fail
```

---

## Failure feedback back to Step 1

When decision is `retry`, augment the Step 1 prompt with:

```
Additional context (from previous iteration):
- Previous candidates: {previous_candidates}
- Test command was: {test_command}
- Test failure output:
  ---
  {test_error_summary}   # last 20 lines with the actual assertion / traceback
  ---
- Previous patch (rejected because tests failed after apply):
  ---
  {previous_patch}
  ---
```

## Iteration budget enforcement

Step-3 owns the budget check. Before looping back to Step 1:

- Increment `iterations` counter
- If `iterations >= 3` → declare `RESULT: repair_failed_after_3_iterations`
- If elapsed wall time > 20 min → declare `RESULT: timeout`
- Otherwise → loop back with augmented context above

## Final output

After the outer skill decides the final result, emit:

```json
{
  "result": "pass | retry_exhausted | localize_failed | infra_fail | timeout",
  "iterations": <N>,
  "candidates_final": [<from last step 1>],
  "patch_final": "<from last step 2, or empty if repair_failed>",
  "test_output_final": "<from last step 3, tail 50 lines>"
}
```
