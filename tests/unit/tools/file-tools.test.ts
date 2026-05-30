import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { rotateBak, writeLuaFile, patchConfig } from '../../../src/tools/file-tools.js';

describe('rotateBak', () => {
  let dir: string;
  beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'usagi-bak-')); });

  it('creates .bak on first overwrite', async () => {
    const file = path.join(dir, 'main.lua');
    await fs.writeFile(file, 'original');
    await rotateBak(file);
    const bak = await fs.readFile(file + '.bak', 'utf8');
    expect(bak).toBe('original');
  });

  it('returns undefined if source does not exist', async () => {
    const file = path.join(dir, 'nonexistent.lua');
    const result = await rotateBak(file);
    expect(result).toBeUndefined();
  });

  it('rotates .bak → .bak.2 → .bak.3 on repeated calls', async () => {
    const file = path.join(dir, 'main.lua');
    // Create 3 rotations
    for (let i = 1; i <= 3; i++) {
      await fs.writeFile(file, `content-${i}`);
      await rotateBak(file);
    }
    await expect(fs.access(file + '.bak')).resolves.toBeUndefined();
    await expect(fs.access(file + '.bak.2')).resolves.toBeUndefined();
    await expect(fs.access(file + '.bak.3')).resolves.toBeUndefined();
  });

  it('deletes .bak.3 on 4th rotation (max 3 bak files)', async () => {
    const file = path.join(dir, 'main.lua');
    for (let i = 1; i <= 4; i++) {
      await fs.writeFile(file, `v${i}`);
      await rotateBak(file);
    }
    // After 4 rotations, max 3 bak files exist
    await expect(fs.access(file + '.bak')).resolves.toBeUndefined();
    await expect(fs.access(file + '.bak.2')).resolves.toBeUndefined();
    await expect(fs.access(file + '.bak.3')).resolves.toBeUndefined();
    // .bak.4 must NOT exist
    await expect(fs.access(file + '.bak.4')).rejects.toThrow();
  });
});

describe('writeLuaFile', () => {
  let dir: string;
  beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'usagi-write-')); });

  it('writes a new lua file', async () => {
    await writeLuaFile(dir, 'main.lua', 'function _init() end', false);
    const content = await fs.readFile(path.join(dir, 'main.lua'), 'utf8');
    expect(content).toBe('function _init() end');
  });

  it('creates parent directories if needed', async () => {
    await writeLuaFile(dir, 'entities/player.lua', 'return {}', false);
    const content = await fs.readFile(path.join(dir, 'entities', 'player.lua'), 'utf8');
    expect(content).toBe('return {}');
  });

  it('throws file_exists if file exists and overwrite is false', async () => {
    await fs.writeFile(path.join(dir, 'main.lua'), 'old');
    await expect(writeLuaFile(dir, 'main.lua', 'new', false))
      .rejects.toMatchObject({ type: 'file_exists' });
  });

  it('creates backup when overwriting', async () => {
    await fs.writeFile(path.join(dir, 'main.lua'), 'original');
    const result = await writeLuaFile(dir, 'main.lua', 'new content', true);
    expect(result.backup_path).toBeDefined();
    const bak = await fs.readFile(path.join(dir, 'main.lua') + '.bak', 'utf8');
    expect(bak).toBe('original');
  });

  it('rejects non-.lua extensions', async () => {
    await expect(writeLuaFile(dir, 'main.txt', 'content', false))
      .rejects.toMatchObject({ type: 'invalid_parameter' });
  });
});

describe('patchConfig', () => {
  it('patches a string field', () => {
    const src = `return {\n  title = "Old Title",\n  width = 320,\n}`;
    const result = patchConfig(src, { title: 'New Title' });
    expect(result).toContain('title = "New Title"');
    expect(result).toContain('width = 320');
  });

  it('patches a number field', () => {
    const src = `return {\n  width = 320,\n}`;
    const result = patchConfig(src, { width: 640 });
    expect(result).toContain('width = 640');
  });

  it('patches a boolean field', () => {
    const src = `return {\n  debug = false,\n}`;
    const result = patchConfig(src, { debug: true });
    expect(result).toContain('debug = true');
  });

  it('injects new field if not present', () => {
    const src = `return {\n  width = 320,\n}`;
    const result = patchConfig(src, { height: 180 });
    expect(result).toContain('height = 180');
  });

  it('throws config_too_complex for function-valued fields', () => {
    const src = `return {\n  width = get_width(),\n}`;
    expect(() => patchConfig(src, { width: 640 })).toThrow();
  });
});
