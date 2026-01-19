# Built-in Commands

This directory contains the built-in slash commands that are injected into all vscode sessions.

## Commands

| Command | Description |
|---------|-------------|
| /suspend | Save all work and terminate the sandbox |
| /pr | Create a pull request from the session branch |
| /share | Grant access to the session to another user |
| /extract | Help capture code as Mastra artifact definitions |
| /env | Display current session and environment information |

## Format

Each command is a markdown file with the following structure:

```markdown
# /command-name

Description of what the command does.

## Usage

How to use the command.

## Examples

Example usage scenarios.
```

Commands are injected to `~/.claude/commands/` in the sandbox.
