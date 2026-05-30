import * as fs from 'fs/promises';
import * as path from 'path';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validatePath, ValidationMode } from '../security/path-validator.js';
import type { PathCache } from '../security/path-cache.js';
import { makeError } from '../errors.js';

export function registerLuaFileResource(server: McpServer, deps: { allowedRoots: string[]; pathCache: PathCache }): void {
  server.resource(
    'usagi-lua-file',
    new ResourceTemplate('usagi://project/{projectPath}/lua/{filename}', { list: undefined }),
    { mimeType: 'text/x-lua' },
    async (uri, variables) => {
      const rawProject = variables['projectPath'];
      const rawFile = variables['filename'];
      const projectPath = decodeURIComponent(Array.isArray(rawProject) ? rawProject[0] ?? '' : rawProject ?? '');
      const filename = decodeURIComponent(Array.isArray(rawFile) ? rawFile[0] ?? '' : rawFile ?? '');

      const validation = await validatePath(projectPath, deps.allowedRoots, ValidationMode.Read);
      if (!validation.ok) throw new Error(JSON.stringify(validation.error));

      // Validate the full file path is within the project
      const filePath = path.join(validation.resolvedPath, filename);
      const fileValidation = await validatePath(filePath, [validation.resolvedPath], ValidationMode.Read);
      if (!fileValidation.ok) throw new Error(JSON.stringify(fileValidation.error));

      let source: string;
      try {
        source = await fs.readFile(fileValidation.resolvedPath, 'utf8');
      } catch {
        throw new Error(JSON.stringify(makeError('asset_not_found', `Lua file not found: ${filename}`)));
      }

      return { contents: [{ uri: uri.href, mimeType: 'text/x-lua', text: source }] };
    }
  );
}
