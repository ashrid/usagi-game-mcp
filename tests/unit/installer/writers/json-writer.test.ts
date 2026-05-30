import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { writeJsonConfig } from '../../../../src/installer/writers/json-writer.js';

describe('writeJsonConfig', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'usagi-json-'));
  });

  it('creates a new config file when none exists', async () => {
    const file = path.join(dir, 'settings.json');
    const result = await writeJsonConfig(file);
    expect(result).toBe('created');
    const contents = JSON.parse(await fs.readFile(file, 'utf8'));
    expect(contents.mcpServers['usagi-game-mcp'].command).toBe('npx');
    expect(contents.mcpServers['usagi-game-mcp'].args).toEqual(['-y', 'usagi-game-mcp']);
  });

  it('merges into an existing config without clobbering other entries', async () => {
    const file = path.join(dir, 'settings.json');
    await fs.writeFile(file, JSON.stringify({ mcpServers: { 'other-mcp': { command: 'other' } } }), 'utf8');
    const result = await writeJsonConfig(file);
    expect(result).toBe('merged');
    const contents = JSON.parse(await fs.readFile(file, 'utf8'));
    expect(contents.mcpServers['other-mcp']).toBeDefined();
    expect(contents.mcpServers['usagi-game-mcp']).toBeDefined();
  });

  it('includes USAGI_ALLOWED_ROOTS in env when allowedRoots provided', async () => {
    const file = path.join(dir, 'settings.json');
    await writeJsonConfig(file, '/my/games');
    const contents = JSON.parse(await fs.readFile(file, 'utf8'));
    expect(contents.mcpServers['usagi-game-mcp'].env.USAGI_ALLOWED_ROOTS).toBe('/my/games');
  });

  it('omits env key when no allowedRoots provided', async () => {
    const file = path.join(dir, 'settings.json');
    await writeJsonConfig(file);
    const contents = JSON.parse(await fs.readFile(file, 'utf8'));
    expect(contents.mcpServers['usagi-game-mcp'].env).toBeUndefined();
  });

  it('returns skipped when entry already exists', async () => {
    const file = path.join(dir, 'settings.json');
    await fs.writeFile(file, JSON.stringify({ mcpServers: { 'usagi-game-mcp': { command: 'npx' } } }), 'utf8');
    const result = await writeJsonConfig(file);
    expect(result).toBe('skipped');
  });

  it('returns parse-error when existing file has invalid JSON', async () => {
    const file = path.join(dir, 'settings.json');
    await fs.writeFile(file, '{ not valid json', 'utf8');
    const result = await writeJsonConfig(file);
    expect(result).toBe('parse-error');
  });

  it('creates parent directories if they do not exist', async () => {
    const file = path.join(dir, 'nested', 'deep', 'settings.json');
    const result = await writeJsonConfig(file);
    expect(result).toBe('created');
    await expect(fs.access(file)).resolves.toBeUndefined();
  });
});
