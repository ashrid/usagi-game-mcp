import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerDevLogResource(server: McpServer): void {
  server.resource(
    'usagi-dev-log',
    new ResourceTemplate('usagi://project/{projectPath}/dev/log', { list: undefined }),
    { mimeType: 'application/json' },
    async (uri, _variables) => {
      // Ring buffer wired in Plan 2 (DevProcessManager)
      const payload = { lines: [], truncated: false, next_line: 0, total_lines: 0 };
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(payload) }] };
    }
  );
}
