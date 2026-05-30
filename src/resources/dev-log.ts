import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DevProcessManager } from '../dev/dev-process-manager.js';
import { validatePath, ValidationMode } from '../security/path-validator.js';

export function registerDevLogResource(
  server: McpServer,
  opts?: { allowedRoots: string[]; devManager: DevProcessManager }
): void {
  server.resource(
    'usagi-dev-log',
    new ResourceTemplate('usagi://project/{projectPath}/dev/log', { list: undefined }),
    { mimeType: 'application/json' },
    async (uri, variables) => {
      if (!opts) {
        const payload = { lines: [], truncated: false, next_line: 0, total_lines: 0 };
        return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(payload) }] };
      }
      const raw = variables['projectPath'];
      const projectPath = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
      const v = await validatePath(projectPath, opts.allowedRoots, ValidationMode.Read);
      if (!v.ok) {
        const payload = { lines: [], truncated: false, next_line: 0, total_lines: 0 };
        return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(payload) }] };
      }
      const proc = opts.devManager.getProcess(v.resolvedPath);
      const buf = proc?.buffer;
      const payload = buf
        ? (() => {
            const lines = Array.from(buf.lines);
            return {
              lines,
              truncated: buf.truncated,
              next_line: buf.totalLinesWritten, // always current write position for resource snapshot
              total_lines: buf.totalLinesWritten,
            };
          })()
        : { lines: [], truncated: false, next_line: 0, total_lines: 0 };
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(payload) }] };
    }
  );
}
