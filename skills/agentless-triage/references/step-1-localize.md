# Step 1 · Localize Prompt Template

**Purpose**: Given a bug description and a repo, return the top 5 file paths most likely to contain the bug.

**Inputs**:
- `{issue_text}` —— full issue description (title + body)
- `{repo_root}` —— absolute path to the repo checkout
- `{repo_structure}` —— (optional) pre-computed tree listing (skip if repo is small enough for the LLM to enumerate via `bash: find $repo_root -type f -name '*.py'`)

**Model**: any capable code model (claude-sonnet-4-5 / gpt-4o / etc.). Do NOT use a small model.

---

## Prompt template (copy-paste, substitute `{...}` slots)

```
You are a code localization expert. Given a bug report and a repository,
identify the top 5 files most likely to contain the code causing the bug.

Repository root: {repo_root}

Bug report:
---
{issue_text}
---

Repository structure (partial —— relevant subtrees only):
{repo_structure}

Instructions:
1. Read the bug report. Identify the affected feature / module.
2. Match the feature to specific file paths in the repo. Prefer:
   - Files whose name matches feature keywords (e.g. "login" → login.py, auth.py)
   - Test files that reference the failing behavior
   - Configuration files (settings.py, urls.py, etc.) if the bug is a config issue
3. Return exactly 5 file paths, ordered by relevance (most likely first).
4. IMPORTANT: Return ONLY the JSON below —— no explanations, no markdown code fences,
   no commentary. Any deviation breaks downstream parsing.

Output format (strict JSON):
{"candidates": [
  "path/relative/to/repo_root/file1.py",
  "path/relative/to/repo_root/file2.py",
  "path/relative/to/repo_root/file3.py",
  "path/relative/to/repo_root/file4.py",
  "path/relative/to/repo_root/file5.py"
]}
```

---

## Retry rules

If output is not valid JSON, retry once with this appended:

```
Previous output failed JSON parsing with: {parse_error}
Return ONLY the JSON object with no other text. No markdown fences.
```

If retry also fails, escalate `RESULT: localize_failed` and stop.

## Iteration hints

If Step 3 fails and we loop back here, augment the prompt with:

```
Additional context (from previous iteration):
- Previous candidates: {previous_candidates}
- Test failure was: {test_error}
- Previous patch (rejected) touched: {previous_patch_files}

Update the localization taking the failure into account —— the previous
candidate set was likely wrong or incomplete.
```
