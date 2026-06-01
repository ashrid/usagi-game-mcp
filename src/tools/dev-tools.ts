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

  server.tool(
    'usagi_dev_reset',
    'Trigger _init() re-run via signal file. Falls back to process restart if signal unsupported.',
    { project_path: z.string() },
    async ({ project_path }) => {
      const v = await validatePath(project_path, allowedRoots, ValidationMode.Read);
      if (!v.ok) return errResponse(v.error);

      const proc = devManager.getProcess(v.resolvedPath);
      if (!proc) return errResponse({ type: 'not_running', message: 'Dev server is not running.' });

      const { randomBytes } = await import('node:crypto');
      const nonce = randomBytes(16).toString('hex');
      proc.lastNonce = nonce;

      try {
        await devManager.writeSignalFile(v.resolvedPath, nonce);
        return okResponse({ success: true, reset_type: 'signal_file' });
      } catch {
        // Fallback: full process restart
        await devManager.stop(v.resolvedPath).catch(() => {});
        await devManager.start(v.resolvedPath);
        return okResponse({ success: true, reset_type: 'process_restart' });
      }
    }
  );

  server.tool(
    'usagi_read_log',
    'Read lines from the dev server ring buffer (positional polling).',
    {
      project_path: z.string(),
      since_line: z.number().optional().default(0),
      count: z.number().optional().default(50),
    },
    async ({ project_path, since_line, count }) => {
      const v = await validatePath(project_path, allowedRoots, ValidationMode.Read);
      if (!v.ok) return errResponse(v.error);
      const proc = devManager.getProcess(v.resolvedPath);
      if (!proc) {
        return okResponse({ lines: [], next_line: 0, total_lines: 0, truncated: false });
      }
      const buf = proc.buffer;
      const lines = buf.slice(since_line, count);
      return okResponse({
        lines,
        next_line: since_line + lines.length,
        total_lines: buf.totalLinesWritten,
        truncated: buf.truncated,
      });
    }
  );

  server.tool(
    'usagi_boot_test',
    'Smoke-test a project: starts the dev server, waits for it to settle, checks logs for errors, then stops it. Exit 124 (timeout kill) = running = PASS.',
    {
      project_path: z.string(),
      timeout_ms: z.number().optional().default(5_000),
    },
    async ({ project_path, timeout_ms }) => {
      const v = await validatePath(project_path, allowedRoots, ValidationMode.Read);
      if (!v.ok) return errResponse(v.error);

      // Stop any existing session so we get a clean log
      await devManager.stop(v.resolvedPath).catch(() => {});

      let pid: number;
      try {
        const r = await devManager.start(v.resolvedPath);
        pid = r.pid;
      } catch (e) {
        return errResponse({ type: 'start_failed', message: String(e) });
      }

      await new Promise(r => setTimeout(r, Math.min(timeout_ms, 10_000)));

      const proc = devManager.getProcess(v.resolvedPath);
      const allLines = proc ? proc.buffer.slice(0, 500) : [];
      const crashed = proc?.status === 'crashed';

      await devManager.stop(v.resolvedPath).catch(() => {});

      // Error patterns from common Usagi runtime failures
      const ERROR_PATTERNS = [
        /\[string .+\]:\d+:/,          // Lua runtime error with location
        /attempt to (index|call) a nil/,
        /stack traceback/,
        /bad argument #\d+ to/,
        /syntax error near/,
        /not found$/,
        /Error:/i,
      ];

      const errorLines = allLines.filter(l => ERROR_PATTERNS.some(p => p.test(l)));
      const passed = !crashed && errorLines.length === 0;

      return okResponse({
        passed,
        pid,
        status: crashed ? 'crashed' : 'ran',
        error_lines: errorLines,
        all_lines: allLines,
        hint: passed
          ? 'No errors detected in boot window.'
          : crashed
            ? 'Dev server crashed. Check error_lines for the first failure.'
            : 'Runtime errors detected. Check error_lines — the first entry is usually the root cause.',
      });
    }
  );
}
