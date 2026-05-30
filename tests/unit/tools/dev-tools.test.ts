import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { DevProcessManager } from '../../../src/dev/dev-process-manager.js';

describe('signal file', () => {
  it('writeSignalFile creates timestamp:nonce format', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'usagi-sig-'));
    const mgr = new DevProcessManager();
    const nonce = 'a'.repeat(32);
    await mgr.writeSignalFile(tmpDir, nonce);
    const content = await fs.readFile(path.join(tmpDir, '.usagi-mcp', 'reset.signal'), 'utf8');
    const parts = content.split(':');
    expect(parts.length).toBe(2);
    expect(Number(parts[0])).toBeGreaterThan(0);
    expect(parts[1]).toBe(nonce);
  });

  it('writeSignalFile is idempotent (overwrites existing)', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'usagi-sig2-'));
    const mgr = new DevProcessManager();
    await mgr.writeSignalFile(tmpDir, 'first'.padEnd(32, '0'));
    await mgr.writeSignalFile(tmpDir, 'second'.padEnd(32, '0'));
    const content = await fs.readFile(path.join(tmpDir, '.usagi-mcp', 'reset.signal'), 'utf8');
    expect(content).toContain('second'.padEnd(32, '0'));
  });
});
