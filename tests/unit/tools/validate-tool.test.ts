import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { validateProject } from '../../../src/tools/validate-tool.js';

describe('validateProject', () => {
  let dir: string;
  beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'usagi-val-')); });

  it('reports missing_file error if main.lua absent', async () => {
    const result = await validateProject(dir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: { type: string }) => e.type === 'missing_file')).toBe(true);
  });

  it('passes with main.lua that has all three lifecycle functions', async () => {
    const src = `function _init() end\nfunction _update(dt) end\nfunction _draw(dt) end\n`;
    await fs.writeFile(path.join(dir, 'main.lua'), src);
    const result = await validateProject(dir);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('reports missing lifecycle functions', async () => {
    await fs.writeFile(path.join(dir, 'main.lua'), 'print("hello")');
    const result = await validateProject(dir);
    expect(result.valid).toBe(false);
    const missingFns = result.errors.filter((e: { type: string }) => e.type === 'missing_function');
    expect(missingFns.length).toBeGreaterThan(0);
  });

  it('always includes limitations array', async () => {
    const result = await validateProject(dir);
    expect(Array.isArray(result.limitations)).toBe(true);
    expect(result.limitations.length).toBeGreaterThan(0);
  });

  it('has correct scope and runtime_validation fields', async () => {
    const result = await validateProject(dir);
    expect(result.scope).toBe('structural');
    expect(result.runtime_validation).toBe('not_supported');
  });
});
