# usagi-game-mcp

An MCP (Model Context Protocol) server that gives AI assistants full awareness of and control over [Usagi](https://usagiengine.com/) game engine projects. Built for Claude Desktop, Claude Code, and any MCP-compatible client.

**36 endpoints** — 14 read resources + 22 write/action tools — covering project inspection, dev server management, file editing, scaffolding, live log streaming, and smoke testing.

---

## What It Does

| Capability | Details |
|---|---|
| **Project awareness** | Reads config, assets, palette, spritesheet, shaders, fonts, save data, settings |
| **Code intelligence** | Builds a require-graph, tracks API calls, sprite refs, and input action refs across all Lua files |
| **Dev server control** | Start/stop/restart/reset the Usagi dev process; stream live output via ring buffer |
| **File editing** | Write/overwrite/delete Lua files with automatic `.bak` rotation; patch config fields; write data files and web shell |
| **Rename + refactor** | Rename any file and automatically update all `require()` calls across the project |
| **Structural validation** | Check lifecycle functions, game_id requirement, missing files — without executing code |
| **Scaffolding** | Generate entity, state, state machine, collision handler, and save system modules |
| **API docs** | Serve the Usagi API reference for `gfx`, `input`, `sfx`, `music`, `util`, `effect` |

---

## Requirements

- **Node.js** 20 or later
- **Usagi** installed and on your PATH (for dev server tools and `usagi_init_project`)
- An MCP client (Claude Desktop, Claude Code, or any MCP-compatible host)

---

## Installation

```bash
npx usagi-game-mcp install
```

The installer detects which agentic CLIs are installed on your machine, presents a checkbox to select which ones to configure, and writes the MCP server entry into each config file.

### Build from source

```bash
git clone https://github.com/ashrid/usagi-game-mcp.git
cd usagi-game-mcp
npm install
npm run build
npm test
```

---

## Configuration

Run `npx usagi-game-mcp install` and the installer handles everything. It scans for installed CLIs, lets you pick which ones to configure via checkbox, and writes the correct config entry into each.

### Supported CLIs

| CLI | Config written |
|---|---|
| Claude Code | `~/.claude/settings.json` |
| Claude Desktop | macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`<br>Windows: `%APPDATA%\Claude\claude_desktop_config.json`<br>Linux: `~/.config/Claude/claude_desktop_config.json` |
| Cursor | `~/.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| OpenCode | `~/.config/opencode/opencode.json` |
| Codex CLI | `~/.codex/config.toml` |
| GitHub Copilot CLI | `~/.copilot/mcp-config.json` |
| Qwen Code | `~/.qwen/settings.json` |
| AntiGravity | `~/.gemini/antigravity-cli/mcp_config.json` |
| Pi | Prints manual instructions (no config file) |

Only CLIs whose config directory exists on your machine are shown in the checkbox.

### Project folder prompt

The installer asks for an optional Usagi projects folder. Press Enter to skip — the server will default to the current working directory when invoked. You can set it later by re-running `npx usagi-game-mcp install` or by telling your agent:

```
Set USAGI_ALLOWED_ROOTS to /path/to/games and re-run: npx usagi-game-mcp install
```

### What the installer writes

**Claude Code, Claude Desktop, Cursor, Windsurf, Copilot CLI, Qwen Code, AntiGravity** (`mcpServers` JSON):

```json
{
  "mcpServers": {
    "usagi-game-mcp": {
      "command": "npx",
      "args": ["-y", "usagi-game-mcp"],
      "env": { "USAGI_ALLOWED_ROOTS": "/path/to/your/games" }
    }
  }
}
```

**OpenCode** (`mcp` key):

```json
{
  "mcp": {
    "usagi-game-mcp": {
      "type": "local",
      "command": ["npx", "-y", "usagi-game-mcp"],
      "enabled": true,
      "environment": { "USAGI_ALLOWED_ROOTS": "/path/to/your/games" }
    }
  }
}
```

**Codex CLI** (TOML):

```toml
[mcp_servers.usagi-game-mcp]
command = "npx"
args = ["-y", "usagi-game-mcp"]

[mcp_servers.usagi-game-mcp.env]
USAGI_ALLOWED_ROOTS = "/path/to/your/games"
```

The `env` / `environment` block is omitted if you skip the folder prompt. Existing entries in config files are never overwritten — the installer skips with `(already installed, skipped)` if the entry already exists.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `USAGI_ALLOWED_ROOTS` | CWD | Semicolon (Windows) or colon (Unix) separated list of project roots the server may access. Paths outside this list are rejected. |
| `USAGI_MCP_RATE_LIMIT` | `60` | Max tool calls per minute. Set to `0` to disable. Read-only tools (`usagi_dev_status`, `usagi_read_log`, `usagi_validate_project`) are always exempt. |

---

## Resources

Resources are read via URI. Your MCP client fetches them automatically when given a project path.

| Resource URI | Description |
|---|---|
| `usagi://project/{path}/config` | Parsed `_config()` — game_id, title, dimensions, actions, palette |
| `usagi://project/{path}/structure` | Full project file tree |
| `usagi://project/{path}/assets` | Sprite and asset catalog |
| `usagi://project/{path}/palette` | Color palette entries |
| `usagi://project/{path}/spritesheet` | Spritesheet metadata |
| `usagi://project/{path}/shaders` | Shader source files |
| `usagi://project/{path}/font` | Font files |
| `usagi://project/{path}/save` | Save file contents |
| `usagi://project/{path}/settings` | Engine settings |
| `usagi://project/{path}/dev/log` | Live dev server output (ring buffer snapshot) |
| `usagi://project/{path}/lua/{file}` | Raw Lua source for any file |
| `usagi://project/{path}/data/{file}` | Data file contents |
| `usagi://project/{path}/context` | Code intelligence: require graph, API call sites, sprite refs, input action refs |
| `usagi://docs/api/{module}` | API reference for `gfx`, `input`, `sfx`, `music`, `util`, `effect`, `usagi`, or `full` |

---

## Tools

### Dev Server

| Tool | Description |
|---|---|
| `usagi_dev_start` | Start the Usagi dev server for a project. Spawns a managed PTY process with crash recovery. |
| `usagi_dev_stop` | Stop the dev server. Sends SIGTERM, falls back to SIGKILL after 5 seconds. |
| `usagi_dev_restart` | Stop then start the dev server. |
| `usagi_dev_status` | Get running status, PID, uptime, and last 10 log lines. |
| `usagi_dev_reset` | Trigger a `_init()` re-run without a full restart (writes a signal file with a nonce). Falls back to process restart if unsupported. |
| `usagi_read_log` | Poll the dev server output ring buffer. Pass `since_line` to get only new lines since last call. |
| `usagi_boot_test` | Smoke-test a project: starts the dev server fresh, waits up to 5 seconds, collects output, stops it, and returns `{ passed, error_lines, all_lines }`. Detects Lua runtime errors, nil dereferences, and syntax failures at boot time. |

The dev server tracks crashes: if the process crashes 3+ times within 30 seconds, auto-restart is disabled and a message is appended to the log.

#### usagi_read_log polling example

```
usagi_read_log({ project_path: "/my/game", since_line: 0, count: 50 })
→ { lines: [...], next_line: 42, total_lines: 42, truncated: false }

usagi_read_log({ project_path: "/my/game", since_line: 42, count: 50 })
→ { lines: [...new lines...], next_line: 51, total_lines: 51, truncated: false }
```

---

### File Tools

| Tool | Description |
|---|---|
| `usagi_write_lua` | Write a `.lua` file. Set `overwrite: true` to replace an existing file (creates `.bak` backup). |
| `usagi_write_config` | Patch flat literal fields in `_config()` — string, number, or boolean values only. |
| `usagi_write_data` | Write a file to the project `data/` directory (JSON or plain text). |
| `usagi_write_web_shell` | Write `shell.html`, the web export HTML shell override. |
| `usagi_read_file` | Read any file within the project. |
| `usagi_list_files` | List files in a project directory. |
| `usagi_delete_file` | Delete a file. Requires `confirm: true`. Creates a `.bak` backup before deleting. Cannot delete `main.lua`. |

Backup rotation keeps up to 3 files: `.bak`, `.bak.2`, `.bak.3`. The oldest is dropped on the 4th overwrite.

---

### Rename

| Tool | Description |
|---|---|
| `usagi_rename_file` | Rename or move a file. Scans up to 500 Lua files and updates all `require()` calls to match the new path. Rolls back require updates if the rename fails. Rejects cross-extension renames. |

---

### Validation

| Tool | Description |
|---|---|
| `usagi_validate_project` | Structural validation + Lua lint scan across all project files. Does not execute code. |

Returns `{ valid, errors, warnings, scope: "structural", runtime_validation: "not_supported", limitations }`.

**Errors** (block `valid: true`): missing `main.lua`, missing `_init`/`_update`/`_draw`, missing `game_id` when `usagi.save/load` is used.

**Warnings** (advisory lint across every `.lua` file):

| Warning type | What it catches |
|---|---|
| `compound_assign_in_if` | `if cond then x += 1 end` — the Usagi preprocessor doesn't rewrite compound assignments on single-line ifs |
| `invalid_color_constant` | `gfx.COLOR_CYAN`, `gfx.COLOR_DARK_RED` — not part of the 16-color palette |
| `engine_global_rawget` | `rawget(_G, "gfx")` / `rawget(_G, "effect")` — engine globals are `nil` at `require()` time and only available inside function bodies |

---

### Scaffold

| Tool | Description |
|---|---|
| `usagi_init_project` | Initialize a new Usagi project by running `usagi init`. |
| `usagi_scaffold_entity` | Generate a Lua entity module with `new()`, `init()`, `update(dt)`, `draw()`. `update` includes `dt = math.min(dt, 0.05)` spike protection. Optionally includes a collision rectangle. |
| `usagi_scaffold_state` | Generate a game-flow state module with `init()`, `update(dt)`, `draw(dt)`. Includes an `_initialized` nil guard so `update`/`draw` are no-ops until `init()` is called, plus `dt` clamping. |
| `usagi_scaffold_state_machine` | Generate a state machine module with a `States` table, `set()`, and `get()`. |
| `usagi_scaffold_collision_handler` | Generate a collision handler module for rect-rect, rect-circle, or circle-circle shapes. |
| `usagi_scaffold_save_system` | Generate a `Save` module with `load()`, `save()`, and `reset()` backed by `usagi.save/load`. |

All scaffold tools accept an `overwrite` flag (default `false`) and validate that names are valid Lua identifiers (`^[A-Za-z_][A-Za-z0-9_]*$`).

---

## Security

- **Path allowlist** — every file access is validated against `USAGI_ALLOWED_ROOTS`. UNC paths, symlink traversal, and hardlink attacks are rejected.
- **Sandboxed config parsing** — `_config()` is evaluated in an isolated Lua sandbox; falls back to regex parsing if the sandbox is unavailable.
- **Filtered subprocess env** — the dev server process only inherits `PATH`, `HOME`, `TMPDIR`, and `USAGI_*` variables.
- **Atomic writes** — all file writes go through a temp file + rename to prevent partial writes.
- **File locking** — concurrent writes use `proper-lockfile` with exponential backoff retry (100ms / 200ms / 400ms).
- **Rate limiting** — configurable requests-per-minute cap; read-only tools are always exempt.

---

## Development

```bash
npm run dev        # TypeScript watch mode
npm test           # Run test suite (vitest)
npm test -- --reporter=verbose   # Verbose output
```

Tests live in `tests/unit/`. Each module has a corresponding test file. The test suite covers path security, ring buffer eviction, lock manager, file backup rotation, config patching, rename with require-graph updates, validation logic, and scaffold generators.

---

## Project Structure

```
src/
  dev/
    ring-buffer.ts          # 500-line / 1MB ring buffer for dev server output
    dev-process-manager.ts  # PTY lifecycle, PID files, crash recovery
  resources/                # 14 MCP read resources
    config.ts               # _config() parser
    context.ts              # Code intelligence (require graph, API/sprite/input refs)
    docs.ts                 # API reference server
    dev-log.ts              # Live log resource (backed by ring buffer)
    ...
  sandbox/
    lua-runner.ts           # Isolated Lua sandbox for config evaluation
    config-parser.ts        # Sandbox + fallback regex config parser
  security/
    path-validator.ts       # 5-step path validation pipeline
    path-cache.ts           # TTL cache for resolved paths
  tools/                    # 21 MCP tools
    dev-tools.ts            # Dev server tools + log reader
    file-tools.ts           # Write, read, list, delete, patch config
    rename-tool.ts          # Rename + require-graph update
    validate-tool.ts        # Structural project validation
    scaffold-tools.ts       # Code generation tools
    lock-manager.ts         # proper-lockfile wrapper
  server.ts                 # Server entry point, resource + tool registration
  index.ts                  # stdio transport bootstrap
```

---

## Changelog

### 0.1.5
- **`usagi_boot_test`** — new smoke-test tool: starts the dev server, waits up to 5 s, captures output, stops it, and returns `passed`/`error_lines`. Detects Lua nil dereferences, syntax errors, and missing-file crashes at boot time.
- **`usagi_validate_project`** — now scans every `.lua` file in the project and returns a `warnings[]` array. Catches compound assignments in single-line `if` statements (`+=`/`-=` preprocessor limitation), invalid palette color constants (`COLOR_CYAN`, `COLOR_DARK_RED`), and `rawget(_G, engine_global)` patterns that return `nil` at require-time.
- **Scaffold templates** — `usagi_scaffold_entity` and `usagi_scaffold_state` now include `dt = math.min(dt, 0.05)` delta-time spike protection in `update()`. `usagi_scaffold_state` adds an `_initialized` nil guard so `update`/`draw` are safe to call before `init()` runs.

### 0.1.0
- Initial release: 35 endpoints, npx installer for 10 CLIs, dev server PTY management, file tools with `.bak` rotation, rename with require-graph rewriting, structural validation, scaffolding, and API docs resource.

---

## License

MIT
