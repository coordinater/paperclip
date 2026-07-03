# Template · State `open`

**Purpose**: The issue was just opened / has no localization done yet. Prompt guides the agent to read the issue carefully and enumerate candidate files.

**Emit this template when**: derived `fsm_state = 'open'` (see SKILL.md §"State derivation rule").

**Suggested downstream skill**: `agentless-triage` step-1-localize.

---

## Prompt template (copy-paste, substitute `{...}` slots)

```
You are working on a fresh issue. Your job is to READ, UNDERSTAND, and LOCALIZE
— not to fix anything yet.

Issue title: {issue_title}
Issue body:
---
{issue_body}
---

Repository root: {repo_root}
Repository structure (partial):
{repo_structure}

Instructions:
1. Read the issue carefully. Identify:
   - What feature / module is affected
   - What behavior is expected vs actual
   - Any error message / stack trace / repro steps mentioned
2. Enumerate the top 5 candidate files most likely to contain the bug.
   Include a one-sentence justification for each.
3. DO NOT propose a fix yet. This step is localization only.
4. If the issue is unclear (missing repro / missing expected behavior /
   internal only phrasing), respond with:
   {"action": "clarify", "questions": ["...", "..."]}
   The caller will hand these back to the human requester.

Output format (strict JSON):
{
  "action": "localized",
  "candidates": [
    {"path": "path/relative/to/repo_root/file1.py", "why": "one sentence"},
    {"path": "path/relative/to/repo_root/file2.py", "why": "one sentence"},
    ...
  ],
  "notes": "one paragraph summary of your understanding of the issue"
}
```

---

## FSM transition after this template

- If output `action == "localized"` → caller writes `issue_documents/fsm_state = "localized"` + `issue_documents/candidates = [...]`
- If output `action == "clarify"` → caller posts questions to the issue as a comment; FSM stays in `open` awaiting human answer
- If output is malformed JSON → caller re-invokes this template once more (does NOT increment `retry_count`; format errors are not "attempts")
