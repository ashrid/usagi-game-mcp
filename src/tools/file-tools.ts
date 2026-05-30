import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validatePath, ValidationMode } from '../security/path-validator.js';
import { withFileLock } from './lock-manager.js';

function okResponse(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}
function errResponse(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }], isError: true as const };
}

/**
 * Rotate backup files: .bak → .bak.2 → .bak.3 (max 3).
 * Returns the .bak path if the source file exists, otherwise undefined.
 */
export async function rotateBak(filePath: string): Promise<string | undefined> {
  try { await fs.access(filePath); } catch { return undefined; }

  const bak3 = filePath + '.bak.3';
  const bak2 = filePath + '.bak.2';
  const bak1 = filePath + '.bak';

  // Remove oldest backup to make room
  await fs.unlink(bak3).catch(() => {});
  // Shift existing backups up
  await fs.rename(bak2, bak3).catch(() => {});
  await fs.rename(bak1, bak2).catch(() => {});

  // Copy current file to .bak
  const content = await fs.readFile(filePath);
  await fs.writeFile(bak1, content);
  return bak1;
}

/**
 * Write a Lua file within the project.
 * - Rejects non-.lua extensions.
 * - Rejects path traversal via '..'.
 * - Throws file_exists if file exists and overwrite is false.
 * - Creates a .bak backup when overwriting an existing file.
 * - Creates parent directories as needed.
 */
export async function writeLuaFile(
  resolvedProjectPath: string,
  relativePath: string,
  content: string,
  overwrite: boolean
): Promise<{ path: string; backup_path?: string }> {
  if (!relativePath.endsWith('.lua')) {
    throw Object.assign(
      new Error('Only .lua files allowed'),
      { type: 'invalid_parameter', reason: 'wrong_extension' }
    );
  }
  if (relativePath.includes('..')) {
    throw Object.assign(
      new Error('Path traversal not allowed'),
      { type: 'path_traversal' }
    );
  }

  const targetPath = path.join(resolvedProjectPath, relativePath);
  const tv = await validatePath(targetPath, [resolvedProjectPath], ValidationMode.Write);
  if (!tv.ok) throw tv.error;

  await fs.mkdir(path.dirname(tv.resolvedPath), { recursive: true });

  let exists = false;
  try { await fs.access(tv.resolvedPath); exists = true; } catch { /* new file */ }

  if (exists && !overwrite) {
    throw Object.assign(
      new Error('File exists'),
      { type: 'file_exists', path: tv.resolvedPath }
    );
  }

  const writeAction = async () => {
    let backup_path: string | undefined;
    if (exists) {
      backup_path = await rotateBak(tv.resolvedPath);
    }
    const tmp = tv.resolvedPath + '_tmp_' + randomBytes(8).toString('hex');
    await fs.writeFile(tmp, content, 'utf8');
    await fs.rename(tmp, tv.resolvedPath);
    return { path: tv.resolvedPath, backup_path };
  };

  if (exists) {
    // Create placeholder so proper-lockfile can lock the file
    return withFileLock(tv.resolvedPath, writeAction, { content });
  } else {
    // New file: create placeholder for locking, then write
    await fs.writeFile(tv.resolvedPath, '', 'utf8');
    return withFileLock(tv.resolvedPath, writeAction, { content });
  }
}

/**
 * Patch flat literal fields in a Lua config table (return { ... }).
 * Supports string, number, and boolean literals.
 * Injects missing fields before the closing brace.
 * Throws config_too_complex if a field exists but is not a patchable literal.
 */
export function patchConfig(source: string, fields: Record<string, string | number | boolean>): string {
  let result = source;
  for (const [key, value] of Object.entries(fields)) {
    const luaValue = typeof value === 'string' ? `"${value}"` : String(value);

    const strPattern = new RegExp(`(^[ \\t]*${key}[ \\t]*=[ \\t]*)"[^"\\\\]*"`, 'm');
    const numPattern = new RegExp(`(^[ \\t]*${key}[ \\t]*=[ \\t]*)\\d+(?:\\.\\d+)?`, 'm');
    const boolPattern = new RegExp(`(^[ \\t]*${key}[ \\t]*=[ \\t]*)(?:true|false)`, 'm');

    let patched = false;
    if (typeof value === 'string' && strPattern.test(result)) {
      result = result.replace(strPattern, `$1${luaValue}`);
      patched = true;
    } else if (typeof value === 'number' && numPattern.test(result)) {
      result = result.replace(numPattern, `$1${luaValue}`);
      patched = true;
    } else if (typeof value === 'boolean' && boolPattern.test(result)) {
      result = result.replace(boolPattern, `$1${luaValue}`);
      patched = true;
    }

    if (!patched) {
      // Check if the field exists but as a non-literal (e.g., function call)
      const anyPattern = new RegExp(`^[ \\t]*${key}[ \\t]*=`, 'm');
      if (anyPattern.test(result)) {
        throw Object.assign(
          new Error(`Field ${key} exists but is not a patchable literal`),
          { type: 'config_too_complex', field: key }
        );
      }
      // Field not present — inject before closing brace
      result = result.replace(/(\n[ \t]*\})([ \t]*)$/, `\n  ${key} = ${luaValue},\n}$2`);
    }
  }
  return result;
}

export function registerFileTools(
  server: McpServer,
  { allowedRoots }: { allowedRoots: string[] }
): void {
  server.tool(
    'usagi_write_lua',
    'Write a Lua file within the project. Creates a .bak backup if overwriting.',
    {
      project_path: z.string(),
      relative_path: z.string(),
      content: z.string(),
      overwrite: z.boolean().optional().default(false),
    },
    async ({ project_path, relative_path, content, overwrite }) => {
      const v = await validatePath(project_path, allowedRoots, ValidationMode.Read);
      if (!v.ok) return errResponse(v.error);
      try {
        const result = await writeLuaFile(v.resolvedPath, relative_path, content, overwrite);
        return okResponse({ success: true, ...result });
      } catch (e: unknown) {
        return errResponse(e);
      }
    }
  );

  server.tool(
    'usagi_write_config',
    'Patch flat literal fields in _config(). Changes take effect after usagi_dev_reset.',
    {
      project_path: z.string(),
      fields: z.record(z.union([z.string(), z.number(), z.boolean()])),
    },
    async ({ project_path, fields }) => {
      const v = await validatePath(project_path, allowedRoots, ValidationMode.Read);
      if (!v.ok) return errResponse(v.error);

      // Find config file
      const candidates = ['main.lua', 'config.lua'];
      let configPath: string | undefined;
      for (const c of candidates) {
        const p = path.join(v.resolvedPath, c);
        try { await fs.access(p); configPath = p; break; } catch { /* try next */ }
      }
      if (!configPath) {
        return errResponse({ type: 'file_not_found', message: 'No main.lua or config.lua found.' });
      }

      const fv = await validatePath(configPath, [v.resolvedPath], ValidationMode.Write);
      if (!fv.ok) return errResponse(fv.error);

      return withFileLock(fv.resolvedPath, async () => {
        const source = await fs.readFile(fv.resolvedPath, 'utf8');
        try {
          const patched = patchConfig(source, fields);
          const tmp = fv.resolvedPath + '_tmp_' + randomBytes(8).toString('hex');
          await fs.writeFile(tmp, patched, 'utf8');
          await fs.rename(tmp, fv.resolvedPath);
          return okResponse({
            success: true,
            patched_fields: Object.keys(fields),
            config_parse_mode: 'fallback_regex',
          });
        } catch (e: unknown) {
          return errResponse(e);
        }
      });
    }
  );
  // More tools added in Tasks 8–10
}
