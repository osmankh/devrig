---
name: suggest-commit
description: Suggest a commit message with testing instructions for staged or unstaged changes
disable-model-invocation: true
argument-hint: [optional focus area]
allowed-tools: Bash, Read, Grep, Glob
---

Analyze all current changes (staged + unstaged) and suggest a commit message with testing instructions. If arguments are provided, focus on: $ARGUMENTS

## Steps

1. Run these commands to understand the changes:
   - `git diff --stat` — overview of changed files
   - `git diff` — full diff of unstaged changes
   - `git diff --cached` — full diff of staged changes
   - `git log --oneline -5` — recent commit style reference

2. Analyze the changes thoroughly:
   - What was added, modified, or removed
   - The motivation behind the changes (why, not just what)
   - Which systems/components are affected
   - Any breaking changes or migration needs

3. Output a suggested commit in this exact format:

---

**Commit message:**

```
<imperative subject line, max 72 chars>

<body: 1-3 sentences explaining the "why", not the "what">
```

---

**How to test:**

<numbered list of concrete, manual testing steps that verify the changes work>

- Start with how to run/build the app
- Walk through the user-facing flow step by step
- Call out what to look for at each step (expected behavior)
- Note any prerequisites, env vars, or edge cases
- If there are non-obvious things to verify, call them out

---

## Rules

- Do NOT create the commit — only suggest
- Use imperative mood in the subject line ("Add", "Fix", "Replace", not "Added", "Fixed", "Replaced")
- Subject line should be specific — avoid generic messages like "Update code" or "Fix bug"
- Testing steps should be actionable by someone unfamiliar with the change
- If changes span multiple concerns, suggest whether to split into multiple commits
- Match the commit style from recent git log
