# Built-in Skills

This directory contains the built-in skills (knowledge/instructions) that are injected into all vscode sessions.

## Skills

| Skill | Description |
|-------|-------------|
| mastra-development | Guidance on writing Mastra tools, agents, and workflows |
| artifact-extraction | Patterns for capturing work as Mastra artifacts |
| session-management | Guidance on git workflow, /suspend vs /pr, and collaboration |

## Format

Each skill is a markdown file with YAML frontmatter:

```markdown
---
name: skill-name
description: Brief description for Claude to decide when to use this skill
---

# Skill Name

Description of the skill's purpose.

## Context

When this skill should be activated.

## Knowledge

The actual knowledge/instructions for Claude.
```

Skills are injected to `/home/coder/.claude/skills/<skill-name>/SKILL.md` in the sandbox.
