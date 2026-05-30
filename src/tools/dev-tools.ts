import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validatePath, ValidationMode } from '../security/path-validator.js';
import type { DevProcessManager } from '../dev/dev-process-manager.js';

function okResponse(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}
function errResponse(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }], isError: true as const };
}

export function registerDevTools(
  server: McpServer,
  { allowedRoots, devManager }: { allowedRoots: string[]; devManager: DevProcessManager }
): void {

  server.tool(
    'usagi_dev_start',
    'Start the Usagi dev server for a project. Spawns `usagi dev` in a PTY.',
    {
      project_path: z.string(),
      wait_for_ready: z.boolean().optional().default(false),
      timeout_ms: z.number().optional().default(10_000),
    },
    async ({ project_path }) => {
      const v = await validatePath(project_path, allowedRoots, ValidationMode.Read);
      if (!v.ok) return errResponse(v.error);
      try {
        const result = await devManager.start(v.resolvedPath);
        return okResponse({ status: 'started', pid: result.pid });
      } catch (e: unknown) {
        const err = e as { type?: string; pid?: number };
        if (err.type === 'dev_already_running') {
          return errResponse({ type: 'dev_already_running', pid: err.pid, hint: 'Call usagi_dev_restart to replace' });
        }
        throw e;
      }
    }
  );

  server.tool(
    'usagi_dev_stop',
    'Stop the Usagi dev server for a project.',
    { project_path: z.string() },
    async ({ project_path }) => {
      const v = await validatePath(project_path, allowedRoots, ValidationMode.Read);
      if (!v.ok) return errResponse(v.error);
      try {
        const result = await devManager.stop(v.resolvedPath);
        return okResponse({ success: true, pid: result.pid });
      } catch (e: unknown) {
        const err = e as { type?: string };
        return errResponse({ type: err.type ?? 'stop_failed', message: String(e) });
      }
    }
  );

  server.tool(
    'usagi_dev_restart',
    'Restart the Usagi dev server (stop then start).',
    { project_path: z.string() },
    async ({ project_path }) => {
      const v = await validatePath(project_path, allowedRoots, ValidationMode.Read);
      if (!v.ok) return errResponse(v.error);
      await devManager.stop(v.resolvedPath).catch(() => {});
      const result = await devManager.start(v.resolvedPath);
      return okResponse({ success: true, pid: result.pid });
    }
  );

  server.tool(
    'usagi_dev_status',
    'Get the current dev server status.',
    { project_path: z.string() },
    async ({ project_path }) => {
      const v = await validatePath(project_path, allowedRoots, ValidationMode.Read);
      if (!v.ok) return errResponse(v.error);
      const status = await devManager.getStatus(v.resolvedPath);
      return okResponse(status);
    }
  );
}
