import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { RingBuffer } from './ring-buffer.js';

export interface DevProcess {
  pty: unknown;
  buffer: RingBuffer;
  projectPath: string;
  status: 'running' | 'crashed' | 'stopped' | 'orphaned';
  startedAt: Date;
  pid: number;
  lastNonce: string | null;
  startHistory: number[];
  crashLooped: boolean;
}

export interface DevStatus {
  running: boolean;
  pid?: number;
  uptime_seconds?: number;
  status: 'running' | 'crashed' | 'stopped' | 'orphaned';
  recent_log: string[];
}

export interface SpawnHandle {
  pid: number;
  onData: (cb: (data: string) => void) => void;
  onExit: (cb: (code: number, signal: number) => void) => void;
  kill: (signal?: string) => void;
}

const CRASH_WINDOW_MS = 30_000;
const CRASH_THRESHOLD = 3;
const CRASH_COOLDOWN_MS = 2_000;
const SIGKILL_TIMEOUT_MS = 5_000;

export class DevProcessManager {
  private processes = new Map<string, DevProcess>();

  // Overridable for testing
  protected _spawnImpl: ((projectPath: string) => Promise<SpawnHandle>) | null = null;
  protected _isAlive: (pid: number) => boolean = (pid) => {
    try { process.kill(pid, 0); return true; } catch { return false; }
  };

  async start(projectPath: string): Promise<{ pid: number }> {
    const existing = this.processes.get(projectPath);
    if (existing && existing.status === 'running' && this._isAlive(existing.pid)) {
      const err = Object.assign(new Error('dev_already_running'), { type: 'dev_already_running', pid: existing.pid });
      throw err;
    }

    await fs.mkdir(path.join(projectPath, '.usagi-mcp'), { recursive: true });
    await ensureGitignore(projectPath);

    const spawnFn = this._spawnImpl ?? this._defaultSpawn.bind(this);
    const handle = await spawnFn(projectPath);

    const proc: DevProcess = {
      pty: handle,
      buffer: new RingBuffer(),
      projectPath,
      status: 'running',
      startedAt: new Date(),
      pid: handle.pid,
      lastNonce: null,
      startHistory: [Date.now()],
      crashLooped: false,
    };

    handle.onData((data: string) => {
      for (const line of sanitizeOutput(data).split('\n')) {
        if (line) proc.buffer.append(line);
      }
    });

    handle.onExit(() => {
      proc.status = 'crashed';
      void this._handleCrash(proc, spawnFn);
    });

    this.processes.set(projectPath, proc);
    await fs.writeFile(path.join(projectPath, '.usagi-mcp', 'dev.pid'), String(handle.pid), 'utf8');
    return { pid: handle.pid };
  }

  async stop(projectPath: string): Promise<{ pid: number }> {
    const proc = this.processes.get(projectPath);
    if (!proc || proc.status === 'stopped') {
      throw Object.assign(new Error('not_running'), { type: 'not_running' });
    }
    const handle = proc.pty as SpawnHandle;

    await new Promise<void>(resolve => {
      let resolved = false;
      const done = () => { if (!resolved) { resolved = true; resolve(); } };

      const timeout = setTimeout(() => {
        handle.kill('SIGKILL');
        done();
      }, SIGKILL_TIMEOUT_MS);

      handle.onExit(() => { clearTimeout(timeout); done(); });

      if (process.platform === 'win32') {
        handle.kill();
      } else {
        handle.kill('SIGTERM');
      }
    });

    proc.status = 'stopped';
    await this._cleanupFiles(projectPath);
    const pid = proc.pid;
    this.processes.delete(projectPath);
    return { pid };
  }

  async getStatus(projectPath: string): Promise<DevStatus> {
    const proc = this.processes.get(projectPath);
    if (!proc) {
      const pidFile = path.join(projectPath, '.usagi-mcp', 'dev.pid');
      try {
        const raw = await fs.readFile(pidFile, 'utf8');
        const pid = Number(raw.trim());
        if (pid && this._isAlive(pid)) {
          return { running: true, pid, status: 'orphaned', recent_log: [] };
        }
        await fs.unlink(pidFile).catch(() => {});
      } catch { /* no pid file */ }
      return { running: false, status: 'stopped', recent_log: [] };
    }

    const uptime = Math.floor((Date.now() - proc.startedAt.getTime()) / 1000);
    const recentLines = Array.from(proc.buffer.lines).slice(-10);
    return {
      running: proc.status === 'running',
      pid: proc.pid,
      uptime_seconds: uptime,
      status: proc.status,
      recent_log: recentLines,
    };
  }

  getProcess(projectPath: string): DevProcess | undefined {
    return this.processes.get(projectPath);
  }

  async writeSignalFile(projectPath: string, nonce: string): Promise<void> {
    const dir = path.join(projectPath, '.usagi-mcp');
    await fs.mkdir(dir, { recursive: true });
    const content = `${Date.now()}:${nonce}`;
    const tmp = path.join(dir, `reset_${randomBytes(8).toString('hex')}.tmp`);
    await fs.writeFile(tmp, content, 'utf8');
    await fs.rename(tmp, path.join(dir, 'reset.signal'));
  }

  async cleanupAll(): Promise<void> {
    for (const [projectPath, proc] of this.processes) {
      try { (proc.pty as SpawnHandle).kill('SIGTERM'); } catch { /* ignore */ }
      await this._cleanupFiles(projectPath).catch(() => {});
    }
    this.processes.clear();
  }

  private async _handleCrash(proc: DevProcess, spawnFn: (p: string) => Promise<SpawnHandle>): Promise<void> {
    const now = Date.now();
    proc.startHistory = proc.startHistory.filter(t => now - t < CRASH_WINDOW_MS);

    if (proc.startHistory.length >= CRASH_THRESHOLD) {
      proc.crashLooped = true;
      proc.status = 'crashed';
      proc.buffer.append('[usagi-mcp] Dev server crash-looped. Call usagi_dev_start again after fixing the issue.');
      return;
    }

    const msSinceStart = now - proc.startedAt.getTime();
    if (msSinceStart < 5_000) {
      await new Promise(r => setTimeout(r, CRASH_COOLDOWN_MS));
    }

    try {
      const handle = await spawnFn(proc.projectPath);
      proc.pty = handle;
      proc.pid = handle.pid;
      proc.status = 'running';
      proc.startedAt = new Date();
      proc.startHistory.push(Date.now());
      handle.onData((data: string) => {
        for (const line of sanitizeOutput(data).split('\n')) {
          if (line) proc.buffer.append(line);
        }
      });
      handle.onExit(() => void this._handleCrash(proc, spawnFn));
    } catch {
      proc.status = 'crashed';
    }
  }

  protected async _defaultSpawn(_projectPath: string): Promise<SpawnHandle> {
    throw new Error('node-pty spawn not implemented; set _spawnImpl for testing or implement in Task 3');
  }

  private async _cleanupFiles(projectPath: string): Promise<void> {
    const dir = path.join(projectPath, '.usagi-mcp');
    await fs.unlink(path.join(dir, 'dev.pid')).catch(() => {});
    await fs.unlink(path.join(dir, 'reset.signal')).catch(() => {});
  }
}

function sanitizeOutput(raw: string): string {
  // Pass 1: strip ANSI escape sequences
  let s = raw.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b[^\[]/g, '');
  // Pass 2: strip remaining non-printable bytes except \n and \t
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '[non-printable]');
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

async function ensureGitignore(projectPath: string): Promise<void> {
  const gi = path.join(projectPath, '.gitignore');
  try {
    const content = await fs.readFile(gi, 'utf8');
    if (!content.includes('.usagi-mcp/')) {
      await fs.appendFile(gi, '\n.usagi-mcp/\n', 'utf8');
    }
  } catch {
    await fs.writeFile(gi, '.usagi-mcp/\n', 'utf8');
  }
}
