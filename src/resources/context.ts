import * as fs from 'fs/promises';
import * as path from 'path';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validatePath, ValidationMode } from '../security/path-validator.js';
import type { PathCache } from '../security/path-cache.js';

const REQUIRE_REGEX = /require\s*\(\s*["']([^"']+)["']\s*\)/g;
const DYNAMIC_REQUIRE_REGEX = /require\s*\(\s*(?!["'])([^)]+)\)/g;
const API_CALL_REGEX = /\b(gfx|input|sfx|music|util|effect|usagi)\.(\w+)\s*\(/g;
const STATE_ASSIGN_REGEX = /\bState\.(\w+)\s*=/g;
const INPUT_REF_REGEX = /input\.(pressed|held|released)\s*\(\s*["'](\w+)["']/g;
const SPRITE_REF_REGEX = /gfx\.spr\s*\(\s*(\d+)/g;

async function scanLuaFiles(root: string, maxFiles = 500): Promise<{ files: Array<{ file: string; source: string }>; limitExceeded: boolean }> {
  const results: Array<{ file: string; source: string }> = [];
  let count = 0;
  let limitExceeded = false;

  async function walk(dir: string): Promise<void> {
    if (count >= maxFiles) { limitExceeded = true; return; }
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch { return; }

    for (const entry of entries) {
      if (count >= maxFiles) { limitExceeded = true; return; }
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.lua')) {
        const source = await fs.readFile(full, 'utf8').catch(() => '');
        results.push({ file: path.relative(root, full), source });
        count++;
      }
    }
  }

  await walk(root);
  return { files: results, limitExceeded };
}

function getLineNumber(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

export function registerContextResource(server: McpServer, deps: { allowedRoots: string[]; pathCache: PathCache }): void {
  server.resource(
    'usagi-project-context',
    new ResourceTemplate('usagi://project/{projectPath}/context', { list: undefined }),
    { mimeType: 'application/json' },
    async (uri, variables) => {
      const raw = variables['projectPath'];
      const projectPath = decodeURIComponent(Array.isArray(raw) ? raw[0] ?? '' : raw ?? '');
      const validation = await validatePath(projectPath, deps.allowedRoots, ValidationMode.Read);
      if (!validation.ok) throw new Error(JSON.stringify(validation.error));

      const root = validation.resolvedPath;
      const { files, limitExceeded } = await scanLuaFiles(root);

      const requireGraph: Record<string, string[]> = {};
      const unresolvableRequires: Array<{ file: string; line: number; expression: string }> = [];
      const apiCalls: Record<string, Array<{ file: string; line: number }>> = {};
      const stateKeys = new Set<string>();
      const inputRefs: Record<string, { defined_in_config: boolean; used_in: Array<{ file: string; line: number }> }> = {};
      const spriteRefs: Record<string, Array<{ file: string; line: number }>> = {};

      for (const { file, source } of files) {
        requireGraph[file] = [];

        // Static requires
        for (const match of source.matchAll(new RegExp(REQUIRE_REGEX.source, 'g'))) {
          requireGraph[file].push(match[1]);
        }
        // Dynamic requires (unresolvable)
        for (const match of source.matchAll(new RegExp(DYNAMIC_REQUIRE_REGEX.source, 'g'))) {
          const lineNum = getLineNumber(source, match.index ?? 0);
          const expr = match[1].trim().slice(0, 80);
          unresolvableRequires.push({
            file,
            line: lineNum,
            expression: expr.length >= 80 ? expr + '[...]' : expr,
          });
        }

        // API calls
        for (const match of source.matchAll(new RegExp(API_CALL_REGEX.source, 'g'))) {
          const key = `${match[1]}.${match[2]}`;
          const lineNum = getLineNumber(source, match.index ?? 0);
          if (!apiCalls[key]) apiCalls[key] = [];
          apiCalls[key].push({ file, line: lineNum });
        }

        // State shape
        for (const match of source.matchAll(new RegExp(STATE_ASSIGN_REGEX.source, 'g'))) {
          stateKeys.add(match[1]);
        }

        // Input refs
        for (const match of source.matchAll(new RegExp(INPUT_REF_REGEX.source, 'g'))) {
          const action = match[2];
          const lineNum = getLineNumber(source, match.index ?? 0);
          if (!inputRefs[action]) {
            inputRefs[action] = { defined_in_config: false, used_in: [] };
          }
          inputRefs[action].used_in.push({ file, line: lineNum });
        }

        // Sprite refs
        for (const match of source.matchAll(new RegExp(SPRITE_REF_REGEX.source, 'g'))) {
          const idx = match[1];
          const lineNum = getLineNumber(source, match.index ?? 0);
          if (!spriteRefs[idx]) spriteRefs[idx] = [];
          spriteRefs[idx].push({ file, line: lineNum });
        }
      }

      // Add static hint for undefined input refs
      const inputRefsWithHints: Record<string, unknown> = {};
      for (const [action, ref] of Object.entries(inputRefs)) {
        if (!ref.defined_in_config) {
          inputRefsWithHints[action] = {
            ...ref,
            hint: 'Action is used but not defined in _config(). Add it to the actions table.',
          };
        } else {
          inputRefsWithHints[action] = ref;
        }
      }

      const payload: Record<string, unknown> = {
        require_graph: requireGraph,
        unresolvable_requires: unresolvableRequires,
        api_calls: apiCalls,
        state_shape: { inferred_keys: Array.from(stateKeys) },
        sprite_refs: spriteRefs,
        input_refs: inputRefsWithHints,
      };
      if (limitExceeded) payload['traversal_limit_exceeded'] = true;

      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(payload) }] };
    }
  );
}
