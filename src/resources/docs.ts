import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VALID_MODULES = new Set(['gfx', 'input', 'sfx', 'music', 'util', 'effect', 'usagi', 'full']);

export function registerDocsResource(server: McpServer): void {
  server.resource(
    'usagi-docs-api',
    new ResourceTemplate('usagi://docs/api/{module}', { list: undefined }),
    { mimeType: 'application/json' },
    async (uri, variables) => {
      const raw = variables['module'];
      const moduleName = decodeURIComponent(Array.isArray(raw) ? raw[0] ?? '' : raw ?? '');

      if (!VALID_MODULES.has(moduleName)) {
        throw new Error(JSON.stringify({
          type: 'invalid_parameter',
          message: `Unknown module: ${moduleName}`,
          reason: 'module_not_found',
        }));
      }

      // Load api-docs.json — it's two directories up from dist/resources/
      // dist/resources/docs.js → __dirname = dist/resources
      // api-docs.json is at project root (usagi-mcp/api-docs.json)
      // From dist/resources → ../../api-docs.json
      const docsPath = path.resolve(__dirname, '../../api-docs.json');
      let docs: { version: string; modules: Record<string, unknown> };
      try {
        docs = JSON.parse(await fs.readFile(docsPath, 'utf8')) as typeof docs;
      } catch {
        throw new Error(JSON.stringify({ type: 'internal_error', message: 'api-docs.json not found' }));
      }

      const payload = moduleName === 'full'
        ? docs
        : { [moduleName]: docs.modules[moduleName] ?? {} };

      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(payload) }] };
    }
  );
}
