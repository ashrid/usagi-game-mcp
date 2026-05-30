import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { getLuaBinary } from './lua-binary.js';
import { buildWrapperScript } from './lua-wrapper.js';

const DEFAULT_TIMEOUT_MS = parseInt(process.env['USAGI_SANDBOX_TIMEOUT_MS'] ?? '5000', 10);
const MIN_TIMEOUT_MS = 500;

export type SandboxResult =
  | { ok: true; config: Record<string, unknown> }
  | { ok: false; errorType: 'syntax' | 'runtime' | 'timeout' | 'internal'; message: string };

export async function runLuaSandbox(
  userSource: string,
  opts: { timeoutMs?: number } = {}
): Promise<SandboxResult> {
  const timeoutMs = Math.max(MIN_TIMEOUT_MS, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const luaBin = await getLuaBinary();

  // Write wrapper script to a temp file with random name
  const tmpDir = os.tmpdir();
  const tmpName = `usagi_sandbox_${crypto.randomBytes(8).toString('hex')}.lua`;
  const tmpPath = path.join(tmpDir, tmpName);

  try {
    const script = buildWrapperScript(userSource);
    await fs.writeFile(tmpPath, script, 'utf8');

    const result = await new Promise<SandboxResult>((resolve) => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
        resolve({ ok: false, errorType: 'timeout', message: 'sandbox_timeout: execution exceeded wall-clock limit' });
      }, timeoutMs);

      execFile(
        luaBin,
        [tmpPath],
        { signal: controller.signal, timeout: timeoutMs + 100 },
        (err, stdout, _stderr) => {
          clearTimeout(timer);
          if (controller.signal.aborted) return; // timeout already resolved

          if (err && (err as NodeJS.ErrnoException).code === 'ABORT_ERR') {
            resolve({ ok: false, errorType: 'timeout', message: 'sandbox_timeout: execution killed' });
            return;
          }

          try {
            const output = stdout.trim();
            const parsed = JSON.parse(output) as { ok: boolean; config?: Record<string, unknown>; error?: string; message?: string };
            if (parsed.ok && parsed.config) {
              resolve({ ok: true, config: parsed.config });
            } else {
              resolve({
                ok: false,
                errorType: (parsed.error as 'syntax' | 'runtime') ?? 'runtime',
                message: parsed.message ?? 'unknown error',
              });
            }
          } catch {
            resolve({
              ok: false,
              errorType: 'internal',
              message: `Failed to parse sandbox output: ${stdout.slice(0, 200)}`,
            });
          }
        }
      );
    });

    return result;
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}
