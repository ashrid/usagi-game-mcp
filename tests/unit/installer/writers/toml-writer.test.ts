import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { writeTomlConfig } from '../../../../src/installer/writers/toml-writer.js';

describe('writeTomlConfig', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'usagi-toml-'));
  });

  it('creates a new TOML file with the server section', async () => {
    const file = path.join(dir, 'config.toml');
    const result = await writeTomlConfig(file);
    expect(result).toBe('created');
    const contents = await fs.readFile(file, 'utf8');
    expect(contents).toContain('[mcp_servers.usagi-game-mcp]');
    expect(contents).toContain('command = "npx"');
    expect(contents).toContain('args = ["-y", "usagi-game-mcp"]');
  });

  it('includes env section when allowedRoots provided', async () => {
    const file = path.join(dir, 'config.toml');
    await writeTomlConfig(file, '/my/games');
    const contents = await fs.readFile(file, 'utf8');
    expect(contents).toContain('[mcp_servers.usagi-game-mcp.env]');
    expect(contents).toContain('USAGI_ALLOWED_ROOTS = "/my/games"');
  });

  it('omits env section when no allowedRoots', async () => {
    const file = path.join(dir, 'config.toml');
    await writeTomlConfig(file);
    const contents = await fs.readFile(file, 'utf8');
    expect(contents).not.toContain('[mcp_servers.usagi-game-mcp.env]');
  });

  it('appends to existing TOML without destroying other sections', async () => {
    const file = path.join(dir, 'config.toml');
    await fs.writeFile(file, '[other_section]\nkey = "value"\n', 'utf8');
    const result = await writeTomlConfig(file);
    expect(result).toBe('merged');
    const contents = await fs.readFile(file, 'utf8');
    expect(contents).toContain('[other_section]');
    expect(contents).toContain('[mcp_servers.usagi-game-mcp]');
  });

  it('returns skipped when section already exists', async () => {
    const file = path.join(dir, 'config.toml');
    await fs.writeFile(file, '[mcp_servers.usagi-game-mcp]\ncommand = "npx"\n', 'utf8');
    const result = await writeTomlConfig(file);
    expect(result).toBe('skipped');
  });

  it('escapes backslashes in Windows paths', async () => {
    const file = path.join(dir, 'config.toml');
    await writeTomlConfig(file, 'C:\\Users\\me\\games');
    const contents = await fs.readFile(file, 'utf8');
    expect(contents).toContain('C:\\\\Users\\\\me\\\\games');
  });

  it('creates parent directories if needed', async () => {
    const file = path.join(dir, 'nested', 'config.toml');
    const result = await writeTomlConfig(file);
    expect(result).toBe('created');
    await expect(fs.access(file)).resolves.toBeUndefined();
  });
});
