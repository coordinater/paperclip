---
name: agentless-triage
description: >
  Three-step Agentless-style SWE-bench triage workflow for fixing code issues:
  (1) localize candidate files from the issue description, (2) generate a repair
  patch, (3) validate by running tests. Falls back to step-1 on failure.
  Use this skill when an issue needs a diagnostic + repair pass without a
  long-horizon multi-tool agent —— Agentless outperforms full agents on
  SWE-bench Lite by staying prompt-simple. Trigger with `/agentless-triage`
  or when handling a SWE-bench-style issue.
---

# Agentless Triage Skill

You are executing a three-step Agentless-style triage on a code issue. This skill borrows the pattern from **OpenAutoCoder/Agentless** (arxiv 2407.01489) —— stay minimal, stay explicit, iterate on failure.

**Design principle**: Don't be an agent. Be three separate prompts. Each one gets fresh context, does one job, hands off structured output to the next.

## The three steps

```
┌──────────────────┐   candidate files   ┌──────────────────┐   patch    ┌──────────────────┐
│  step-1-localize │ ──────────────────> │  step-2-repair   │ ─────────> │  step-3-validate │
└──────────────────┘                     └──────────────────┘            └──────────────────┘
        ↑                                                                          │
        │                        failure signal                                    │
        └──────────────────────────────────────────────────────────────────────────┘
```

## When to use

- Issue text describes a bug + expected behavior (e.g. "clicking login does nothing; expected redirect to /home")
- Repo is small-to-medium (< 5000 files) so localize can enumerate structure
- Test suite exists and can be invoked (`pytest` / `npm test` / `pnpm --filter <pkg> test` / etc.)
- Baseline / benchmark context (e.g. running SWE-bench Lite instances via `mini_swe_local` adapter)

## When NOT to use

- Issue is spec-writing / greenfield (no existing bug) —— use a full agent instead
- Issue requires multi-hour reasoning or cross-repo refactor —— use SWE-agent or claude-code full
- No test suite exists —— step-3 has no fallback signal; skip to manual review

## Workflow (verbatim execution)

### Step 1 · Localize

Read `references/step-1-localize.md` for the prompt template. Run it with:
- `{issue_text}` = full issue description
- `{repo_root}` = execution workspace cwd

Output: JSON `{"candidates": ["path/to/file1.py", "path/to/file2.py", ...]}` (top 5, ordered by relevance).

**If output is not valid JSON or fewer than 2 candidates**: retry step-1 with tighter prompt (add "IMPORTANT: return ONLY the JSON, no commentary").

### Step 2 · Repair

Read `references/step-2-repair.md` for the prompt template. Run it with:
- `{issue_text}` (same as step-1)
- `{candidates}` = JSON array from step-1
- `{candidate_contents}` = full text of each candidate file (concat with `--- <path> ---` separators)

Output: a **unified diff** patch (git-apply-able).

**If patch fails `git apply --check`**: retry with feedback ("previous patch failed to apply because {error}; regenerate with strict git-diff format").

### Step 3 · Validate

Read `references/step-3-validate.md` for the prompt template. Run it with:
- `{patch}` (from step-2)
- `{test_command}` = repo's test invocation

Apply patch → run tests → parse output.

**Decision tree**:
- Tests pass → declare success. Emit final `RESULT: pass` + patch.
- Tests fail with clear error → **loop back to step-1** with augmented context: original issue + failing test output + the failed patch. Max 3 iterations, then declare failure.
- Tests fail with infra error (import missing, env broken) → declare `RESULT: infra_fail` with error message; do not loop (repair won't help).

## Iteration budget

- Max **3 full loops** (step-1 → step-2 → step-3 → back to step-1)
- Total budget guard: if elapsed wall time > 20 minutes for a single issue, abort with `RESULT: timeout`
- If step-1 fails validation 3 times in a row (bad JSON), abort with `RESULT: localize_failed`

## Output contract (final)

Emit a single JSON blob at the end:

```json
{
  "result": "pass|repair_failed|localize_failed|infra_fail|timeout",
  "iterations": 1,
  "candidates_final": ["..."],
  "patch_final": "diff --git ...",
  "test_output_final": "..."
}
```

## Integration with Paperclip

- Skill can be triggered by an agent adapter (`claude_local` / `mini_swe_local` / etc.) —— the adapter passes issue context via `PAPERCLIP_TASK_BODY` env var + prompt template
- Skill output goes to `activity_log` per Paperclip's standard `agent_skill_ran` event
- If `RESULT: pass`, a `hire_reviewer` approval may auto-trigger downstream via `code-review` skill (M1 W4-D1)
- If `RESULT: repair_failed / localize_failed`, agent should emit `human_help_requested` approval to escalate

## References

- `references/step-1-localize.md` —— localize prompt template
- `references/step-2-repair.md` —— repair prompt template
- `references/step-3-validate.md` —— validate prompt template
- Origin: Agentless paper (arxiv 2407.01489) —— [OpenAutoCoder/Agentless](https://github.com/OpenAutoCoder/Agentless)
- Handbook: `handoff/04-施工手册-M2.md` §W5.D2
- Related adapter: `packages/adapters/mini-swe-agent-local/` (M2 W5-D1 · likely runner for this skill)
