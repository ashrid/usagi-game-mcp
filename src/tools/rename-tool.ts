import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validatePath, ValidationMode } from '../security/path-validator.js';
import { withMultiLock } from './lock-manager.js';

const MAX_SCAN_FILES = 500;
const MAX_SCAN_DEPTH = 20;

function okResponse(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}
function errResponse(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }], isError: true as const };
}

export async function renameFile(
  resolvedProjectPath: string,
  fromRelative: string,
  toRelative: string,
  overwrite = false
): Promise<{ old_path: string; new_path: string; require_updates: number; traversal_limit_exceeded?: boolean }> {
  const fromExt = path.extname(fromRelative);
  const toExt = path.extname(toRelative);
  if (fromExt !== toExt) {
    throw Object.assign(new Error('Extension must match'), { type: 'invalid_parameter', reason: 'extension_mismatch' });
  }

  const fromAbs = path.join(resolvedProjectPath, fromRelative);
  const toAbs = path.join(resolvedProjectPath, toRelative);

  const fv = await validatePath(fromAbs, [resolvedProjectPath], ValidationMode.Write);
  if (!fv.ok) throw fv.error;

  // Validate destination directory is inside project
  const toDir = path.dirname(toAbs);
  const toDirNormalized = path.resolve(toDir);
  if (!toDirNormalized.startsWith(path.resolve(resolvedProjectPath))) {
    throw Object.assign(new Error('Destination outside project'), { type: 'path_traversal' });
  }

  // Check destination exists before locking
  let toExists = false;
  try { await fs.access(toAbs); toExists = true; } catch { /* ok */ }
  if (toExists && !overwrite) {
    throw Object.assign(new Error('Target file already exists'), { type: 'file_exists', path: toAbs });
  }

  // Create placeholder for destination so proper-lockfile can lock it
  await fs.mkdir(path.dirname(toAbs), { recursive: true });
  if (!toExists) await fs.writeFile(toAbs, '', 'utf8');

  return withMultiLock([fromAbs, toAbs], async () => {
    let requireUpdates = 0;
    let traversalLimitExceeded = false;
    const rollbackList: Array<{ file: string; original: string }> = [];

    if (fromExt === '.lua') {
      const fromModule = pathToModuleName(fromRelative);
      const toModule = pathToModuleName(toRelative);

      const { files, exceeded } = await scanLuaFiles(resolvedProjectPath);
      traversalLimitExceeded = exceeded;

      const pattern = buildRequirePattern(fromModule);

      for (const luaFile of files) {
        if (path.resolve(luaFile) === path.resolve(fromAbs)) continue;
        const content = await fs.readFile(luaFile, 'utf8').catch(() => null);
        if (content === null) continue;
        if (pattern.test(content)) {
          rollbackList.push({ file: luaFile, original: content });
        }
      }

      // Apply require updates
      try {
        for (const { file, original } of rollbackList) {
          const updated = original.replace(buildRequirePattern(fromModule), `require("${toModule}")`);
          await fs.writeFile(file, updated, 'utf8');
          requireUpdates++;
        }
      } catch (e) {
        // Rollback all applied updates
        for (const { file, original } of rollbackList) {
          await fs.writeFile(file, original, 'utf8').catch(() => {});
        }
        // Clean up placeholder destination
        if (!toExists) await fs.unlink(toAbs).catch(() => {});
        throw Object.assign(e as object, { type: 'lua_runtime_error' });
      }
    }

    // Perform the rename
    await fs.rename(fromAbs, toAbs);

    return {
      old_path: fromAbs,
      new_path: toAbs,
      require_updates: requireUpdates,
      ...(traversalLimitExceeded ? { traversal_limit_exceeded: true } : {}),
    };
  });
}

function pathToModuleName(relativePath: string): string {
  return relativePath
    .replace(/\.lua$/, '')
    .replace(/\\/g, '/')
    .replace(/\//g, '.');
}

function buildRequirePattern(moduleName: string): RegExp {
  const escaped = moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`require\\(["']${escaped}["']\\)`, 'g');
}

async function scanLuaFiles(
  projectPath: string
): Promise<{ files: string[]; exceeded: boolean }> {
  const result: string[] = [];
  let exceeded = false;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_SCAN_DEPTH || result.length >= MAX_SCAN_FILES) {
      exceeded = true;
      return;
    }
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (result.length >= MAX_SCAN_FILES) { exceeded = true; return; }
      const full = path.join(dir, e.name);
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
        await walk(full, depth + 1);
      } else if (e.isFile() && e.name.endsWith('.lua')) {
        result.push(full);
      }
    }
  }

  await walk(projectPath, 0);
  return { files: result, exceeded };
}

export function registerRenameTools(
  server: McpServer,
  { allowedRoots }: { allowedRoots: string[] }
): void {
  server.tool(
    'usagi_rename_file',
    'Rename or move a file within the project. Updates require() calls in Lua files. Rolls back on failure.',
    {
      project_path: z.string(),
      from: z.string(),
      to: z.string(),
      overwrite: z.boolean().optional().default(false),
    },
    async ({ project_path, from, to, overwrite }) => {
      const v = await validatePath(project_path, allowedRoots, ValidationMode.Read);
      if (!v.ok) return errResponse(v.error);
      try {
        const result = await renameFile(v.resolvedPath, from, to, overwrite);
        return okResponse({ success: true, ...result });
      } catch (e: unknown) {
        return errResponse(e);
      }
    }
  );
}
