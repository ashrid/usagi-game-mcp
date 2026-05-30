import * as fs from 'fs/promises';
import * as path from 'path';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validatePath, ValidationMode } from '../security/path-validator.js';
import type { PathCache } from '../security/path-cache.js';

const IGNORED = new Set(['.git', 'node_modules', '.usagi-mcp', 'dist', 'build']);
const MAX_DEPTH = 20;

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  children?: FileEntry[];
}

async function buildTree(dirPath: string, depth: number): Promise<{ entries: FileEntry[]; limitExceeded: boolean }> {
  if (depth > MAX_DEPTH) return { entries: [], limitExceeded: true };
  let limitExceeded = false;

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const result: FileEntry[] = [];

  for (const entry of entries) {
    if (IGNORED.has(entry.name)) continue;
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const sub = await buildTree(fullPath, depth + 1);
      if (sub.limitExceeded) limitExceeded = true;
      result.push({ name: entry.name, type: 'directory', children: sub.entries });
    } else if (entry.isFile()) {
      const stat = await fs.stat(fullPath).catch(() => null);
      result.push({
        name: entry.name,
        type: 'file',
        size: stat?.size,
        modified: stat?.mtime.toISOString(),
      });
    }
  }
  return { entries: result, limitExceeded };
}

export function registerStructureResource(server: McpServer, deps: { allowedRoots: string[]; pathCache: PathCache }): void {
  server.resource(
    'usagi-project-structure',
    new ResourceTemplate('usagi://project/{projectPath}/structure', { list: undefined }),
    { mimeType: 'application/json' },
    async (uri, variables) => {
      const raw = variables['projectPath'];
      const projectPath = decodeURIComponent(Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? ''));
      const validation = await validatePath(projectPath, deps.allowedRoots, ValidationMode.Read);
      if (!validation.ok) throw new Error(JSON.stringify(validation.error));

      const { entries, limitExceeded } = await buildTree(validation.resolvedPath, 0);
      const payload: Record<string, unknown> = { files: entries };
      if (limitExceeded) payload['traversal_limit_exceeded'] = true;

      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(payload) }] };
    }
  );
}
