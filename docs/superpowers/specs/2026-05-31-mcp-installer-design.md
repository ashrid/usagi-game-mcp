# MCP Installer Design

## Goal

Add `npx usagi-game-mcp install` — a single command that detects installed agentic CLIs on the user's machine, presents a checkbox to select which ones to configure, and writes the correct MCP server config into each CLI's config file.

## Architecture

### Entry point gate

`src/index.ts` checks `process.argv[2]` before starting the MCP server:

```typescript
if (process.argv[2] === 'install') {
  const { runInstaller } = await import('./installer/index.js');
  await runInstaller();
  process.exit(0);
}
// else: normal MCP server startup
```

The installer code is dynamically imported — it is never loaded during normal MCP server operation. Zero impact on context window usage or server startup time.

### File structure

```
src/installer/
  index.ts            — orchestration: detect → checkbox prompt → folder prompt → write → report
  detect.ts           — probes os.homedir() + process.env for each CLI's known directory
  configs.ts          — resolves the correct config file path per CLI + OS
  writers/
    json-writer.ts    — merge-safe write into mcpServers JSON configs (7 CLIs)
    opencode-writer.ts — merge-safe write into OpenCode mcp key format
    toml-writer.ts    — merge-safe append into Codex CLI TOML config
```

### package.json changes

- `name`: `usagi-mcp` → `usagi-game-mcp`
- `bin`: `{ "usagi-game-mcp": "dist/index.js" }`
- Add dependency: `"@inquirer/checkbox": "^4.0.0"` (checkbox UI, only used by installer)

---

## CLI Detection + Config Map

Detection checks for the existence of a known directory using `os.homedir()` and `process.env`. All paths use `os.homedir()` as the base unless the platform requires an environment variable (`APPDATA`, `USERPROFILE`).

### Full cross-platform path table

| CLI | Detection dir | macOS config path | Windows config path | Linux config path |
|---|---|---|---|---|
| **Claude Code** | `~/.claude/` | `~/.claude/settings.json` | `~/.claude/settings.json` | `~/.claude/settings.json` |
| **Claude Desktop** | OS app data dir | `~/Library/Application Support/Claude/claude_desktop_config.json` | `%APPDATA%\Claude\claude_desktop_config.json` | `~/.config/Claude/claude_desktop_config.json` |
| **Cursor** | `~/.cursor/` | `~/.cursor/mcp.json` | `~/.cursor/mcp.json` | `~/.cursor/mcp.json` |
| **Windsurf** | `~/.codeium/windsurf/` | `~/.codeium/windsurf/mcp_config.json` | `%USERPROFILE%\.codeium\windsurf\mcp_config.json` | `~/.codeium/windsurf/mcp_config.json` |
| **OpenCode** | `~/.config/opencode/` | `~/.config/opencode/opencode.json` | `~/.config\opencode\opencode.json` | `~/.config/opencode/opencode.json` |
| **Codex CLI** | `~/.codex/` | `~/.codex/config.toml` | `~/.codex/config.toml` | `~/.codex/config.toml` |
| **Copilot CLI** | `~/.copilot/` | `~/.copilot/mcp-config.json` | `~/.copilot/mcp-config.json` | `~/.copilot/mcp-config.json` |
| **Qwen Code** | `~/.qwen/` | `~/.qwen/settings.json` | `~/.qwen/settings.json` | `~/.qwen/settings.json` |
| **AntiGravity** | `~/.gemini/antigravity-cli/` (mac/linux) `%USERPROFILE%\.gemini\antigravity\` (win) | `~/.gemini/antigravity-cli/mcp_config.json` | `%USERPROFILE%\.gemini\antigravity\mcp_config.json` | `~/.gemini/antigravity-cli/mcp_config.json` |
| **Pi** | `~/.pi/` | print instructions only | print instructions only | print instructions only |

Path resolution uses `os.platform()`, `os.homedir()`, and `process.env.APPDATA` / `process.env.USERPROFILE` where needed. No hardcoded user names or absolute paths.

### Config shapes

Three shapes cover all CLIs:

**Shape 1 — `mcpServers` JSON** (Claude Code, Claude Desktop, Cursor, Windsurf, Copilot CLI, Qwen Code, AntiGravity — 7 CLIs):

```json
{
  "mcpServers": {
    "usagi-game-mcp": {
      "command": "npx",
      "args": ["-y", "usagi-game-mcp"],
      "env": { "USAGI_ALLOWED_ROOTS": "/path/to/games" }
    }
  }
}
```

If the user skips the folder prompt, the `env` key is omitted entirely.

**Shape 2 — OpenCode `mcp` key**:

```json
{
  "mcp": {
    "usagi-game-mcp": {
      "type": "local",
      "command": ["npx", "-y", "usagi-game-mcp"],
      "enabled": true,
      "environment": { "USAGI_ALLOWED_ROOTS": "/path/to/games" }
    }
  }
}
```

**Shape 3 — Codex CLI TOML**:

```toml
[mcp_servers.usagi-game-mcp]
command = "npx"
args = ["-y", "usagi-game-mcp"]

[mcp_servers.usagi-game-mcp.env]
USAGI_ALLOWED_ROOTS = "/path/to/games"
```

TOML is written with a minimal hand-rolled serializer — no TOML parser dependency. Appends the section if it doesn't exist; skips if it does.

---

## UX Flow

```
$ npx usagi-game-mcp install

╔══════════════════════════════════════╗
║     Usagi Game MCP Installer         ║
╚══════════════════════════════════════╝

Scanning for installed CLIs...

? Select CLIs to configure:  (Space to toggle, A to select all, Enter to confirm)
  ◉ Claude Code     ~/.claude/settings.json
  ◉ Cursor          ~/.cursor/mcp.json
  ◉ Windsurf        ~/.codeium/windsurf/mcp_config.json
  ○ Pi              (manual instructions only)

? Usagi projects folder (press Enter to skip):
  > ___

Installing...
  ✓ Claude Code  → ~/.claude/settings.json            (merged)
  ✓ Cursor       → ~/.cursor/mcp.json                 (created)
  ✓ Windsurf     → ~/.codeium/windsurf/mcp_config.json (merged)

  ℹ Pi: install pi-mcp-adapter extension, then add:
      command: npx -y usagi-game-mcp
      env:     USAGI_ALLOWED_ROOTS=/path/to/games

Restart your CLI tools to activate the server.
```

### Behavioural rules

| Situation | Behaviour |
|---|---|
| Entry already exists in config | Skip with `(already installed, skipped)` |
| Config file does not exist yet | Create it from scratch; `mkdir -p` the parent directory |
| Config file exists but is malformed JSON/TOML | Skip that CLI with a parse error warning; never corrupt the file |
| No CLIs detected | Print manual one-liners for all CLIs and exit |
| Folder prompt skipped | Omit `USAGI_ALLOWED_ROOTS` from config; print note that the server defaults to CWD |
| Pi selected | Always print instructions; never write a file |

### Skipped folder note

When `USAGI_ALLOWED_ROOTS` is omitted:

```
ℹ No project folder set. The server will default to the current working directory.
  To add one later, tell your agent:
  "Set USAGI_ALLOWED_ROOTS to /path/to/games and re-run: npx usagi-game-mcp install"
```

---

## npm Publish

```bash
npm run build
npm publish --access public
```

After publishing, the end-user command on any platform is:

```bash
npx usagi-game-mcp install
```

No cloning, no `npm install`, no `npm run build` required on the user's side.

---

## What Is NOT in Scope

- Uninstall / rollback (not requested)
- Auto-updating the server entry when a new version is published (not requested)
- Project-scoped config files (`.cursor/mcp.json`, `opencode.json` in project root) — global only
- GUI / web-based installer
