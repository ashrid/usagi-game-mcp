import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { detectCLIs } from '../../../src/installer/detect.js';

describe('detectCLIs', () => {
  let tmpHome: string;

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), 'usagi-detect-'));
  });

  it('returns empty array when no CLIs present', async () => {
    const result = await detectCLIs(tmpHome);
    expect(result).toHaveLength(0);
  });

  it('detects claude-code when .claude dir exists', async () => {
    await fs.mkdir(path.join(tmpHome, '.claude'));
    const result = await detectCLIs(tmpHome);
    expect(result.some(c => c.id === 'claude-code')).toBe(true);
  });

  it('detects cursor when .cursor dir exists', async () => {
    await fs.mkdir(path.join(tmpHome, '.cursor'));
    const result = await detectCLIs(tmpHome);
    expect(result.some(c => c.id === 'cursor')).toBe(true);
  });

  it('detects opencode when .config/opencode dir exists', async () => {
    await fs.mkdir(path.join(tmpHome, '.config', 'opencode'), { recursive: true });
    const result = await detectCLIs(tmpHome);
    expect(result.some(c => c.id === 'opencode')).toBe(true);
  });

  it('detects pi when .pi dir exists', async () => {
    await fs.mkdir(path.join(tmpHome, '.pi'));
    const result = await detectCLIs(tmpHome);
    const pi = result.find(c => c.id === 'pi');
    expect(pi).toBeDefined();
    expect(pi?.writer).toBe('manual');
  });

  it('detected CLI has label, configPath, and writer fields', async () => {
    await fs.mkdir(path.join(tmpHome, '.cursor'));
    const result = await detectCLIs(tmpHome);
    const cursor = result.find(c => c.id === 'cursor');
    expect(cursor?.label).toBe('Cursor');
    expect(cursor?.configPath).toBeTruthy();
    expect(cursor?.writer).toBe('json');
  });
});
