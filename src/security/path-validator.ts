import * as path from 'path';
import * as fs from 'fs/promises';
import { makeError, type McpError } from '../errors.js';

export enum ValidationMode {
  Read = 'read',
  Write = 'write',
}

export type ValidationResult =
  | { ok: true; resolvedPath: string }
  | { ok: false; error: McpError };

export async function validatePath(
  rawPath: string,
  allowedRoots: string[],
  mode: ValidationMode
): Promise<ValidationResult> {
  const isUncPath = rawPath.startsWith('\\\\') || rawPath.startsWith('//');

  // Step 0: UNC path rejection
  if (isUncPath) {
    const allowedUnc = allowedRoots.some(
      r => r.startsWith('\\\\') || r.startsWith('//')
    );
    if (!allowedUnc) {
      return {
        ok: false,
        error: makeError(
          'path_traversal',
          'UNC paths are not allowed unless explicitly listed in USAGI_ALLOWED_ROOTS',
          { hint: 'Set USAGI_ALLOWED_ROOTS to an explicit UNC prefix to allow SMB share access.' }
        ),
      };
    }

    // For UNC paths that are explicitly allowed, perform prefix-based allowlist check
    // directly on the normalized raw path (path.resolve mangles UNC paths on Windows).
    const normalizedRaw = path.win32.normalize(rawPath).toLowerCase();
    const uncAllowed = allowedRoots.some(root => {
      if (!root.startsWith('\\\\') && !root.startsWith('//')) return false;
      let normalizedRoot = path.win32.normalize(root).toLowerCase();
      // Remove trailing separator for consistent prefix comparison
      if (normalizedRoot.endsWith('\\')) {
        normalizedRoot = normalizedRoot.slice(0, -1);
      }
      const sep = '\\';
      return normalizedRaw.startsWith(normalizedRoot + sep) ||
             normalizedRaw === normalizedRoot;
    });
    if (!uncAllowed) {
      return {
        ok: false,
        error: makeError(
          'path_traversal',
          'Path is outside allowed roots',
          { hint: 'Set USAGI_ALLOWED_ROOTS to include this directory.' }
        ),
      };
    }

    // Return with the raw path as resolved (realpath on UNC shares may not be available)
    return { ok: true, resolvedPath: rawPath };
  }

  // Step 1: Absolute resolve
  const absolute = path.resolve(rawPath);

  // Step 2: Resolve symlinks
  let resolved: string;
  try {
    resolved = await fs.realpath(absolute);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      // Check if it's a broken symlink (exists as an entry but target missing)
      try {
        await fs.lstat(absolute);
        return {
          ok: false,
          error: makeError('symlink_broken', 'Symlink exists but its target is missing', {
            hint: 'The symlink target does not exist.',
          }),
        };
      } catch {
        // Path doesn't exist at all — for writes this is OK (we'll create it)
        if (mode === ValidationMode.Write) {
          resolved = absolute;
        } else {
          return {
            ok: false,
            error: makeError('path_traversal', `Path does not exist: ${path.basename(absolute)}`),
          };
        }
      }
    } else {
      return {
        ok: false,
        error: makeError('path_traversal', `Cannot resolve path: ${(err as Error).message}`),
      };
    }
  }

  // Step 3: Allowlist check (case-normalized comparison)
  const normalizedResolved = resolved.toLowerCase();
  const allowed = allowedRoots.some(root => {
    const normalizedRoot = path.resolve(root).toLowerCase();
    return normalizedResolved.startsWith(normalizedRoot + path.sep.toLowerCase()) ||
           normalizedResolved === normalizedRoot;
  });

  if (!allowed) {
    return {
      ok: false,
      error: makeError(
        'path_traversal',
        'Path is outside allowed roots',
        { hint: 'Set USAGI_ALLOWED_ROOTS to include this directory.' }
      ),
    };
  }

  // Step 5 (writes only): Hardlink detection
  if (mode === ValidationMode.Write) {
    try {
      const stat = await fs.stat(resolved);
      if (stat.nlink > 1) {
        return {
          ok: false,
          error: makeError(
            'path_traversal',
            'Target file has multiple hard links — refusing write to prevent overwriting files outside the project',
            { hint: 'Remove the extra hard link before writing to this file.' }
          ),
        };
      }
    } catch {
      // File doesn't exist yet — that's fine for writes
    }
  }

  return { ok: true, resolvedPath: resolved };
}
