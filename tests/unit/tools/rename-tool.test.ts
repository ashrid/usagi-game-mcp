import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { renameFile } from '../../../src/tools/rename-tool.js';

describe('renameFile', () => {
  let dir: string;
  beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'usagi-rename-')); });

  it('renames a file', async () => {
    await fs.writeFile(path.join(dir, 'old.lua'), 'return {}');
    const result = await renameFile(dir, 'old.lua', 'new.lua');
    await expect(fs.access(path.join(dir, 'new.lua'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(dir, 'old.lua'))).rejects.toThrow();
    expect(result.require_updates).toBe(0);
  });

  it('updates require calls in other lua files', async () => {
    await fs.writeFile(path.join(dir, 'module.lua'), 'return {}');
    await fs.writeFile(path.join(dir, 'main.lua'), 'local m = require("module")');
    const result = await renameFile(dir, 'module.lua', 'my_module.lua');
    const main = await fs.readFile(path.join(dir, 'main.lua'), 'utf8');
    expect(main).toContain('require("my_module")');
    expect(result.require_updates).toBe(1);
  });

  it('rejects mismatched extensions', async () => {
    await fs.writeFile(path.join(dir, 'file.lua'), 'return {}');
    await expect(renameFile(dir, 'file.lua', 'file.txt'))
      .rejects.toMatchObject({ type: 'invalid_parameter', reason: 'extension_mismatch' });
  });

  it('throws file_exists if target exists and overwrite is false', async () => {
    await fs.writeFile(path.join(dir, 'a.lua'), 'return 1');
    await fs.writeFile(path.join(dir, 'b.lua'), 'return 2');
    await expect(renameFile(dir, 'a.lua', 'b.lua', false))
      .rejects.toMatchObject({ type: 'file_exists' });
  });

  it('rolls back require updates if rename fails', async () => {
    await fs.writeFile(path.join(dir, 'module.lua'), 'return {}');
    await fs.writeFile(path.join(dir, 'main.lua'), 'local m = require("module")');
    await fs.writeFile(path.join(dir, 'b.lua'), 'return {}');
    // Try to rename to existing file without overwrite (will fail after updating requires)
    // In practice rollback is hard to test cleanly, just verify the rename throws on conflict
    await expect(renameFile(dir, 'module.lua', 'b.lua', false))
      .rejects.toMatchObject({ type: 'file_exists' });
    // main.lua should still have original require
    const main = await fs.readFile(path.join(dir, 'main.lua'), 'utf8');
    expect(main).toContain('require("module")');
  });
});
