import * as fs from 'fs/promises';
import * as path from 'path';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validatePath, ValidationMode } from '../security/path-validator.js';
import type { PathCache } from '../security/path-cache.js';

export function registerSettingsResource(server: McpServer, deps: { allowedRoots: string[]; pathCache: PathCache }): void {
  server.resource(
    'usagi-project-settings',
    new ResourceTemplate('usagi://project/{projectPath}/settings', { list: undefined }),
    { mimeType: 'application/json' },
    async (uri, variables) => {
      const raw = variables['projectPath'];
      const projectPath = decodeURIComponent(Array.isArray(raw) ? raw[0] ?? '' : raw ?? '');
      const validation = await validatePath(projectPath, deps.allowedRoots, ValidationMode.Read);
      if (!validation.ok) throw new Error(JSON.stringify(validation.error));

      let settings: unknown = null;
      try {
        settings = JSON.parse(await fs.readFile(path.join(validation.resolvedPath, 'settings.json'), 'utf8'));
      } catch { /* no settings file */ }

      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ settings }) }] };
    }
  );
}
