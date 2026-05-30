import { describe, it, expect } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { getConfigPath } from '../../../src/installer/configs.js';

describe('getConfigPath', () => {
  it('returns claude-code settings.json in home dir', () => {
    const result = getConfigPath('claude-code');
    expect(result).toBe(path.join(os.homedir(), '.claude', 'settings.json'));
  });

  it('returns cursor mcp.json in home dir', () => {
    const result = getConfigPath('cursor');
    expect(result).toBe(path.join(os.homedir(), '.cursor', 'mcp.json'));
  });

  it('returns opencode opencode.json under .config', () => {
    const result = getConfigPath('opencode');
    expect(result).toBe(path.join(os.homedir(), '.config', 'opencode', 'opencode.json'));
  });

  it('returns codex config.toml', () => {
    const result = getConfigPath('codex');
    expect(result).toBe(path.join(os.homedir(), '.codex', 'config.toml'));
  });

  it('returns empty string for pi', () => {
    const result = getConfigPath('pi');
    expect(result).toBe('');
  });

  it('throws for unknown CLI id', () => {
    expect(() => getConfigPath('unknown-cli')).toThrow();
  });
});
