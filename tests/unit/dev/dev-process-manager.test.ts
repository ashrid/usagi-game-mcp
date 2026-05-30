import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { DevProcessManager } from '../../../src/dev/dev-process-manager.js';

describe('DevProcessManager', () => {
  let tmpDir: string;
  let manager: DevProcessManager;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'usagi-test-'));
    manager = new DevProcessManager();
  });

  it('returns stopped status for unknown project', async () => {
    const s = await manager.getStatus(tmpDir);
    expect(s.status).toBe('stopped');
    expect(s.running).toBe(false);
  });

  it('creates .usagi-mcp directory and PID file on start', async () => {
    manager['_spawnImpl'] = async () => ({
      pid: 9999,
      onData: (_cb: (d: string) => void) => {},
      onExit: (_cb: (code: number, signal: number) => void) => {},
      kill: (_signal?: string) => {},
    });
    await manager.start(tmpDir);
    const pidFile = path.join(tmpDir, '.usagi-mcp', 'dev.pid');
    const content = await fs.readFile(pidFile, 'utf8');
    expect(Number(content.trim())).toBe(9999);
  });

  it('returns dev_already_running if process is alive', async () => {
    manager['_spawnImpl'] = async () => ({
      pid: 9999,
      onData: () => {},
      onExit: () => {},
      kill: () => {},
    });
    manager['_isAlive'] = (_pid: number) => true;
    await manager.start(tmpDir);
    const err = await manager.start(tmpDir).catch((e: unknown) => e);
    expect((err as { type?: string }).type).toBe('dev_already_running');
  });

  it('status is running after start', async () => {
    manager['_spawnImpl'] = async () => ({
      pid: 1234,
      onData: () => {},
      onExit: () => {},
      kill: () => {},
    });
    await manager.start(tmpDir);
    const status = await manager.getStatus(tmpDir);
    expect(status.status).toBe('running');
    expect(status.pid).toBe(1234);
  });

  it('writeSignalFile creates file with timestamp:nonce format', async () => {
    const nonce = 'a'.repeat(32);
    await manager.writeSignalFile(tmpDir, nonce);
    const content = await fs.readFile(path.join(tmpDir, '.usagi-mcp', 'reset.signal'), 'utf8');
    const [ts, n] = content.split(':');
    expect(Number(ts)).toBeGreaterThan(0);
    expect(n).toBe(nonce);
  });
});
