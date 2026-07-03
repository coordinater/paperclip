# Step 2 · Repair Prompt Template

**Purpose**: Given a bug report and candidate file contents, generate a unified diff that fixes the bug.

**Inputs**:
- `{issue_text}` —— full issue description (title + body)
- `{candidates}` —— JSON array of file paths from Step 1
- `{candidate_contents}` —— full text of each candidate file, joined with headers

**Model**: same as Step 1 (must produce reliable code output). Prefer higher context window.

---

## Prompt template (copy-paste, substitute `{...}` slots)

```
You are a bug-fix engineer. Given a bug report and the current source
of candidate files, generate a minimal unified diff that fixes the bug.

Bug report:
---
{issue_text}
---

Candidate files (from Step 1 localization):

{candidate_contents}

Instructions:
1. Read the bug report carefully. Understand the expected vs actual behavior.
2. Identify the smallest change that fixes the bug. Prefer:
   - Single-line edits over multi-line
   - Localized changes over cross-file changes
   - Behavior-preserving edits over structural refactors
3. Generate a unified diff (git apply-able format). Include enough context lines
   for clean application (at least 3 lines before/after each hunk).
4. Do NOT include changes unrelated to the bug (no formatting churn,
   no unrelated imports, no comment tweaks).
5. If the fix requires editing a file NOT in the candidate list, respond with:
   {"error": "candidate_insufficient", "needed_files": ["path1", "path2"]}
   Otherwise output the diff directly.

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
- Include full file headers (--- a/... +++ b/...) for each modified file
```

---

## Retry rules

If `git apply --check` fails on the generated patch:

```
Previous patch failed `git apply --check` with error:
{apply_error}

Common causes:
- Line numbers in @@ hunks are off (recount from actual file)
- Missing context lines (need 3+ before/after each change)
- Whitespace mismatch (tabs vs spaces; trailing whitespace)
- File header path wrong (verify path exactly matches candidate)

Regenerate the diff with strict adherence to the format. Same fix intent, cleaner patch.
```

## Iteration hints

If Step 3 tests fail and we loop back, this file gets called again with:

```
Previous patch:
{previous_patch}

Test output showing failure:
{test_error}

Analyze why the patch didn't fix the bug (or introduced a new failure).
Generate a corrected patch.
```

## Escalation rules

- If model returns `{"error": "candidate_insufficient", ...}` → loop back to Step 1 with the requested extra files added to the localization context
- If patch cannot apply cleanly after 2 retries → escalate `RESULT: repair_failed` and stop
