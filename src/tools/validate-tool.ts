import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validatePath, ValidationMode } from '../security/path-validator.js';
import { parseFallbackRegex } from '../sandbox/config-parser.js';

interface ValidationError {
  type: string;
  file?: string;
  line?: number;
  message: string;
  hint?: string;
}

const INVALID_COLORS: Record<string, string> = {
  'COLOR_CYAN': 'Use gfx.COLOR_BLUE or gfx.COLOR_WHITE instead.',
  'COLOR_DARK_RED': 'Use gfx.COLOR_RED instead.',
};

const ENGINE_GLOBALS = ['gfx', 'input', 'sfx', 'music', 'effect', 'usagi', 'util'];
const SKIP_DIRS = new Set(['.git', 'node_modules', '.usagi-mcp', 'dist']);

async function collectLuaFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const name = String(entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(name)) {
          results.push(...await collectLuaFiles(path.join(dir, name)));
        }
      } else if (name.endsWith('.lua')) {
        results.push(path.join(dir, name));
      }
    }
  } catch { /* unreadable dir */ }
  return results;
}

export function lintLuaSource(source: string, relPath: string): ValidationError[] {
  const issues: ValidationError[] = [];
  const lines = source.split('\n');

  // Lesson 2: compound assignment operators inside single-line if statements
  lines.forEach((line, i) => {
    const stripped = line.replace(/--.*$/, '');
    if (/\bthen\b.*(?:\+=|-=|\*=|\/=)/.test(stripped)) {
      issues.push({
        type: 'compound_assign_in_if',
        file: relPath,
        line: i + 1,
        message: 'Compound assignment (+=/-=) inside single-line if is not supported by the Usagi preprocessor.',
        hint: 'Split to multi-line: if cond then\n  x = x + 1\nend',
      });
    }
  });

  // Lesson 3: invalid color constants
  for (const [badColor, hint] of Object.entries(INVALID_COLORS)) {
    const regex = new RegExp(`gfx\\.${badColor}\\b`, 'g');
    let m: RegExpExecArray | null;
    while ((m = regex.exec(source)) !== null) {
      const line = source.substring(0, m.index).split('\n').length;
      issues.push({
        type: 'invalid_color_constant',
        file: relPath,
        line,
        message: `gfx.${badColor} is not a valid Usagi palette color.`,
        hint,
      });
    }
  }

  // Lesson 14: rawget(_G, engine_global) — nil at require-time
  for (const glob of ENGINE_GLOBALS) {
    const regex = new RegExp(`rawget\\s*\\(\\s*_G\\s*,\\s*["']${glob}["']\\s*\\)`, 'g');
    let m: RegExpExecArray | null;
    while ((m = regex.exec(source)) !== null) {
      const line = source.substring(0, m.index).split('\n').length;
      issues.push({
        type: 'engine_global_rawget',
        file: relPath,
        line,
        message: `rawget(_G, "${glob}") returns nil at require-time; engine globals are injected after modules load.`,
        hint: `Use the bare global \`${glob}\` directly inside function bodies instead.`,
      });
    }
  }

  return issues;
}

export async function validateProject(projectPath: string): Promise<{
  valid: boolean;
  scope: 'structural';
  runtime_validation: 'not_supported';
  errors: ValidationError[];
  warnings: ValidationError[];
  limitations: string[];
}> {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const mainLua = path.join(projectPath, 'main.lua');
  let mainSource = '';

  try {
    mainSource = await fs.readFile(mainLua, 'utf8');
  } catch {
    errors.push({
      type: 'missing_file',
      file: 'main.lua',
      message: 'main.lua is required but was not found.',
      hint: 'Create main.lua with _init(), _update(dt), and _draw(dt) functions.',
    });
  }

  if (mainSource) {
    for (const fn of ['_init', '_update', '_draw']) {
      if (!new RegExp(`function\\s+${fn}\\s*\\(`).test(mainSource)) {
        errors.push({
          type: 'missing_function',
          file: 'main.lua',
          message: `${fn}() is not defined in main.lua.`,
          hint: `Add: function ${fn}() end`,
        });
      }
    }

    if (/usagi\.save|usagi\.load/.test(mainSource)) {
      const parsed = parseFallbackRegex(mainSource);
      if (!parsed.config['game_id']) {
        errors.push({
          type: 'missing_config',
          file: 'main.lua',
          message: 'game_id is required in _config() when using usagi.save/load.',
          hint: 'Add game_id = "my_game" to the _config() return table.',
        });
      }
    }
  }

  // Lint all Lua files for common pitfalls
  const luaFiles = await collectLuaFiles(projectPath);
  for (const luaFile of luaFiles) {
    let src: string;
    try { src = await fs.readFile(luaFile, 'utf8'); }
    catch { continue; }
    const rel = path.relative(projectPath, luaFile).replace(/\\/g, '/');
    warnings.push(...lintLuaSource(src, rel));
  }

  return {
    valid: errors.length === 0,
    scope: 'structural',
    runtime_validation: 'not_supported',
    errors,
    warnings,
    limitations: [
      'Does not check Lua logic errors or runtime behavior',
      'Does not validate sprite indices referenced in code',
      'Does not detect game_id collisions with other installed games',
      'Does not check audio/shader file content validity',
    ],
  };
}

function okResponse(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}
function errResponse(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }], isError: true as const };
}

export function registerValidateTools(
  server: McpServer,
  { allowedRoots }: { allowedRoots: string[] }
): void {
  server.tool(
    'usagi_validate_project',
    'Structural validation of a Usagi project (does not execute code).',
    { project_path: z.string() },
    async ({ project_path }) => {
      const v = await validatePath(project_path, allowedRoots, ValidationMode.Read);
      if (!v.ok) return errResponse(v.error);
      const result = await validateProject(v.resolvedPath);
      return okResponse(result);
    }
  );
}
