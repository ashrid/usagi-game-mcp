import * as fs from 'fs/promises';
import * as path from 'path';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validatePath, ValidationMode } from '../security/path-validator.js';
import type { PathCache } from '../security/path-cache.js';

export function registerFontResource(server: McpServer, deps: { allowedRoots: string[]; pathCache: PathCache }): void {
  server.resource(
    'usagi-project-font',
    new ResourceTemplate('usagi://project/{projectPath}/font', { list: undefined }),
    { mimeType: 'application/json' },
    async (uri, variables) => {
      const raw = variables['projectPath'];
      const projectPath = decodeURIComponent(Array.isArray(raw) ? raw[0] ?? '' : raw ?? '');
      const validation = await validatePath(projectPath, deps.allowedRoots, ValidationMode.Read);
      if (!validation.ok) throw new Error(JSON.stringify(validation.error));

      const fontPng = path.join(validation.resolvedPath, 'font.png');
      const fontJson = path.join(validation.resolvedPath, 'font.json');

      const exists = await fs.access(fontPng).then(() => true).catch(() => false);
      if (!exists) {
        return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ font: null }) }] };
      }

      let metadata: unknown = null;
      try {
        metadata = JSON.parse(await fs.readFile(fontJson, 'utf8'));
      } catch { /* no companion JSON */ }

      const stat = await fs.stat(fontPng).catch(() => null);
      const payload = { font: { exists: true, size_bytes: stat?.size, metadata } };
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(payload) }] };
    }
  );
}
