# Claude Code Manager

A web-based session browser for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) conversations. Browse, search, and fork sessions stored in your local `~/.claude/` directory.

![Claude Code Manager](docs/ccmanager.png)

## Features

- **Browse sessions** — View all Claude Code conversations across projects
- **Search & filter** — Find sessions by content, project, slug, or session ID
- **Markdown rendering** — Syntax-highlighted code blocks and GitHub-flavored markdown
- **Resume sessions** — Get the CLI command to continue any session
- **Fork conversations** — Branch off at any message to explore a different direction, preserving full context up to that point

## Quick Start

```bash
git clone https://github.com/nicobailon/claude-code-manager.git
cd claude-code-manager
```
```
./run.sh
```

That's it. The script checks for prerequisites, installs dependencies if needed, and starts the app. Open **http://localhost:5173** once it's running.

## Prerequisites (installed automatically with run.sh)

- **Node.js 18+** — [nodejs.org](https://nodejs.org) or via `nvm install --lts`
- **npm 7+** — ships with Node.js 18+
- **Claude Code session history** in `~/.claude/` (the app reads sessions from there)
