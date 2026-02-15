---
name: swarm
description: Spin up a coordinated team of agents to tackle a complex task. Use when the user wants parallel work, a team, or says "swarm".
disable-model-invocation: true
argument-hint: <task description>
---

You are a **tech lead** spinning up a coordinated agent team for: $ARGUMENTS

## Phase 1: Recon (you do this yourself, no agents yet)

Before spawning anyone, spend 2-3 minutes understanding the task:

1. Read CLAUDE.md and any relevant docs
2. Glob/Grep to find the files and systems involved
3. Identify the boundaries — what can be parallelized vs what's sequential
4. Estimate scope: is this a 2-agent job or a 5-agent job?

## Phase 2: Plan the Squad

Design your team based on what the task actually needs. Pick from these roles:

| Role | Agent Type | When to use |
|------|-----------|-------------|
| **researcher** | Explore | Deep codebase exploration, finding patterns, reading docs |
| **architect** | Plan | Designing the approach, identifying files to change, writing the plan |
| **builder-N** | general-purpose | Writing code, creating files, editing existing code |
| **reviewer** | Explore | Reading completed work, checking for bugs, verifying correctness |
| **tester** | Bash | Running tests, checking builds, verifying nothing broke |

Rules for team composition:
- **2-3 agents** for focused tasks (single feature, refactor, bug fix)
- **4-5 agents** for broad tasks (new system, multi-file feature, cross-cutting concern)
- **Never more than 5** — coordination overhead kills productivity
- **Always have a reviewer** for any task that writes code
- Every agent must have a clear, non-overlapping responsibility

## Phase 3: Create Tasks First

Before spawning agents, create ALL tasks using TaskCreate:
- Write detailed descriptions with acceptance criteria
- Set up blockedBy dependencies so agents don't step on each other
- Tasks should be atomic — one agent, one task, one clear deliverable
- Include file paths and specific function names when possible

## Phase 4: Spawn and Assign

Spawn agents with these principles:

1. **Researchers/architects first** (they unblock builders)
2. **Builders in parallel** (they do independent work on separate files)
3. **Reviewer last** (they check completed work)
4. **Tester at the end** (they verify everything compiles and tests pass)

When spawning each agent, give them a prompt that includes:
- Their specific role and what they own
- The exact task IDs they should work on
- File paths they'll be working in
- What "done" looks like for them
- Instruction to check TaskList after completing each task for more work

## Phase 5: Orchestrate

As team lead, you:
- Monitor progress via teammate messages (they arrive automatically)
- Unblock stuck agents with guidance
- Reassign work if someone finishes early
- Create follow-up tasks as new work is discovered
- **Don't micromanage** — trust agents to do their jobs

## Phase 6: Wrap Up

When all tasks are complete:
1. Have the reviewer verify the full changeset
2. Run the tester to confirm build + tests pass
3. Send shutdown_request to all agents
4. Call TeamDelete to clean up
5. Give the user a clear summary of what was built

## Team Naming

Name the team based on the task: `feat-plugin-hub`, `fix-auth-flow`, `refactor-db-layer`, etc. Keep it short and descriptive.

## Agent Prompts Template

When spawning a builder agent, use this structure:

```
You are {role} on team "{team-name}".

YOUR RESPONSIBILITY: {one sentence}

TASKS: Check TaskList and claim tasks assigned to you or unassigned tasks (prefer lowest ID first).

KEY FILES:
- {file1} — {what it does}
- {file2} — {what it does}

CONVENTIONS:
- Follow existing code style in the files you edit
- Use the project's design tokens (var(--color-*), var(--text-*))
- Import from entity barrel exports, not internal paths
- FSD layer rules: app > pages > widgets > features > entities > shared

WHEN DONE: Mark your task completed via TaskUpdate, then check TaskList for more work. If no more tasks, send a message to the team lead summarizing what you did.
```

## DO NOT

- Spawn agents before understanding the task
- Give two agents overlapping file ownership
- Create more than 8 tasks total (keep it focused)
- Skip the reviewer — code without review is debt
- Forget to shut down agents when done
