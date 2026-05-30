import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { writeOpenCodeConfig } from '../../../../src/installer/writers/opencode-writer.js';

describe('writeOpenCodeConfig', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'usagi-opencode-'));
  });

  it('creates new config with mcp key', async () => {
    const file = path.join(dir, 'opencode.json');
    const result = await writeOpenCodeConfig(file);
    expect(result).toBe('created');
    const contents = JSON.parse(await fs.readFile(file, 'utf8'));
    expect(contents.mcp['usagi-game-mcp'].type).toBe('local');
    expect(contents.mcp['usagi-game-mcp'].command).toEqual(['npx', '-y', 'usagi-game-mcp']);
    expect(contents.mcp['usagi-game-mcp'].enabled).toBe(true);
  });

  it('includes environment key when allowedRoots provided', async () => {
    const file = path.join(dir, 'opencode.json');
    await writeOpenCodeConfig(file, '/games');
    const contents = JSON.parse(await fs.readFile(file, 'utf8'));
    expect(contents.mcp['usagi-game-mcp'].environment.USAGI_ALLOWED_ROOTS).toBe('/games');
  });

  it('omits environment key when no allowedRoots', async () => {
    const file = path.join(dir, 'opencode.json');
    await writeOpenCodeConfig(file);
    const contents = JSON.parse(await fs.readFile(file, 'utf8'));
    expect(contents.mcp['usagi-game-mcp'].environment).toBeUndefined();
  });

  it('merges without overwriting other mcp entries', async () => {
    const file = path.join(dir, 'opencode.json');
    await fs.writeFile(file, JSON.stringify({ mcp: { 'other-server': { type: 'local', command: ['other'] } } }), 'utf8');
    await writeOpenCodeConfig(file);
    const contents = JSON.parse(await fs.readFile(file, 'utf8'));
    expect(contents.mcp['other-server']).toBeDefined();
    expect(contents.mcp['usagi-game-mcp']).toBeDefined();
  });

  it('returns skipped when entry already exists', async () => {
    const file = path.join(dir, 'opencode.json');
    await fs.writeFile(file, JSON.stringify({ mcp: { 'usagi-game-mcp': { type: 'local' } } }), 'utf8');
    const result = await writeOpenCodeConfig(file);
    expect(result).toBe('skipped');
  });

  it('returns parse-error for malformed JSON', async () => {
    const file = path.join(dir, 'opencode.json');
    await fs.writeFile(file, '{ bad json', 'utf8');
    const result = await writeOpenCodeConfig(file);
    expect(result).toBe('parse-error');
  });
});
