import * as fs from 'fs/promises';
import * as path from 'path';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validatePath, ValidationMode } from '../security/path-validator.js';
import { parseConfig } from '../sandbox/config-parser.js';
import { makeError } from '../errors.js';
import type { PathCache } from '../security/path-cache.js';

interface Deps {
  allowedRoots: string[];
  pathCache: PathCache;
}

export function registerConfigResource(server: McpServer, deps: Deps): void {
  server.resource(
    'usagi-project-config',
    new ResourceTemplate('usagi://project/{projectPath}/config', { list: undefined }),
    { mimeType: 'application/json' },
    async (uri, variables) => {
      const raw = variables['projectPath'];
      const projectPath = decodeURIComponent(Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? ''));

      const validation = await validatePath(projectPath, deps.allowedRoots, ValidationMode.Read);
      if (!validation.ok) {
        throw new Error(JSON.stringify(validation.error));
      }

      // Find _config() — check main.lua, config.lua, _config.lua
      const configCandidates = ['main.lua', 'config.lua', '_config.lua'];
      let luaSource: string | null = null;
      for (const candidate of configCandidates) {
        try {
          luaSource = await fs.readFile(path.join(validation.resolvedPath, candidate), 'utf8');
          break;
        } catch { /* try next */ }
      }

      if (!luaSource) {
        throw new Error(JSON.stringify(makeError('asset_not_found', 'No main.lua or config.lua found in project')));
      }

      const parsed = await parseConfig(luaSource, validation.resolvedPath);
      return {
        contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(parsed) }],
      };
    }
  );
}
