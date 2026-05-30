import * as fs from 'fs/promises';
import * as path from 'path';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validatePath, ValidationMode } from '../security/path-validator.js';
import type { PathCache } from '../security/path-cache.js';
import { makeError } from '../errors.js';

export function registerDataFileResource(server: McpServer, deps: { allowedRoots: string[]; pathCache: PathCache }): void {
  server.resource(
    'usagi-data-file',
    new ResourceTemplate('usagi://project/{projectPath}/data/{filename}', { list: undefined }),
    { mimeType: 'application/json' },
    async (uri, variables) => {
      const rawProject = variables['projectPath'];
      const rawFile = variables['filename'];
      const projectPath = decodeURIComponent(Array.isArray(rawProject) ? rawProject[0] ?? '' : rawProject ?? '');
      const filename = decodeURIComponent(Array.isArray(rawFile) ? rawFile[0] ?? '' : rawFile ?? '');

      const validation = await validatePath(projectPath, deps.allowedRoots, ValidationMode.Read);
      if (!validation.ok) throw new Error(JSON.stringify(validation.error));

      const dataDir = path.join(validation.resolvedPath, 'data');
      const filePath = path.join(dataDir, filename);

      // Validate the file path is within the data directory
      const fileValidation = await validatePath(filePath, [dataDir], ValidationMode.Read);
      if (!fileValidation.ok) throw new Error(JSON.stringify(fileValidation.error));

      let text: string;
      try {
        text = await fs.readFile(fileValidation.resolvedPath, 'utf8');
      } catch {
        throw new Error(JSON.stringify(makeError('asset_not_found', `Data file not found: ${filename}`)));
      }

      const ext = path.extname(filename).toLowerCase();
      const mimeType = ext === '.json' ? 'application/json' : 'text/plain';
      return { contents: [{ uri: uri.href, mimeType, text }] };
    }
  );
}
