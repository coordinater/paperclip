# Template · State `localized`

**Purpose**: Candidate files identified. Prompt guides the agent to write a minimal repair patch.

**Emit this template when**: derived `fsm_state = 'localized'` (see SKILL.md).

**Suggested downstream skill**: `agentless-triage` step-2-repair.

---

## Prompt template (copy-paste, substitute `{...}` slots)

```
You are writing a bug-fix patch. Localization is done — you know which files
to touch. Your job is to write a MINIMAL, CORRECT unified diff.

Issue title: {issue_title}
Issue body:
---
{issue_body}
---

Candidate files (from state `open`):
{candidates_with_why}

Current file contents (concat with `--- <path> ---` separators):
{candidate_contents}

Retry count so far: {retry_count}

Instructions:
1. Read the candidate files carefully. Locate the exact lines involved.
2. Write a MINIMAL unified diff (git-apply-able). Prefer:
   - Single-line edits over multi-line
   - Localized changes over cross-file changes
   - Behavior-preserving edits over structural refactors
3. Include at least 3 context lines before and after each hunk.
4. If the candidates DON'T contain the bug (localization was wrong),
   respond with:
   {"action": "relocalize", "needed_files": ["path1", "path2"], "reason": "..."}
   The caller will loop back to state `open` with the extra files added.

Output format (strict diff):
diff --git a/path/to/file.py b/path/to/file.py
index abc..def 100644
--- a/path/to/file.py
+++ b/path/to/file.py
@@ -linenumber,count +linenumber,count @@ context
 unchanged line
-removed line
+added line
 unchanged line

Rules:
- No commentary before or after the diff
- No markdown code fences (no ``` diff blocks)
- If relocalizing, output ONLY the JSON above, no diff
```

---

## FSM transition after this template

- If output is a valid patch → caller writes `issue_documents/fsm_state = "patched"` + `issue_documents/patch_url = "..."`; caller kicks off verify step
- If output is `{"action": "relocalize", ...}` → caller stays in `open` state, augments candidate list with `needed_files`, re-invokes state-open template
- If `git apply --check` fails on the patch → caller retries THIS template with feedback in the prompt (see SKILL.md "Iteration budget"); increments `retry_count`; if `retry_count >= 3` → escalate
