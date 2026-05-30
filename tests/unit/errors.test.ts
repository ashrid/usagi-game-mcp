import { describe, it, expect } from 'vitest';
import { makeError, isUsagiError, redactAbsolutePaths } from '../../src/errors.js';

describe('makeError', () => {
  it('creates a minimal error with only required fields', () => {
    const e = makeError('path_traversal', 'Path escapes allowed root');
    expect(e.type).toBe('path_traversal');
    expect(e.message).toBe('Path escapes allowed root');
    expect(e.file).toBeUndefined();
    expect(e.line).toBeUndefined();
  });

  it('creates a full error with all optional fields', () => {
    const e = makeError('lua_runtime_error', 'nil index', {
      file: 'player.lua',
      line: 42,
      hint: 'gfx is only available in _draw',
      lua_error: 'attempt to index nil',
    });
    expect(e.file).toBe('player.lua');
    expect(e.line).toBe(42);
    expect(e.hint).toBe('gfx is only available in _draw');
    expect(e.lua_error).toBe('attempt to index nil');
  });
});

describe('redactAbsolutePaths', () => {
  it('redacts absolute Unix paths from error messages', () => {
    const result = redactAbsolutePaths(
      'Failed to read /home/user/projects/game/player.lua',
      '/home/user/projects/game'
    );
    expect(result).toBe('Failed to read <project>/player.lua');
  });

  it('redacts absolute Windows paths', () => {
    const result = redactAbsolutePaths(
      'Cannot open C:\\Users\\dev\\game\\main.lua',
      'C:\\Users\\dev\\game'
    );
    expect(result).toBe('Cannot open <project>/main.lua');
  });

  it('leaves messages without absolute paths unchanged', () => {
    const msg = 'attempt to index a nil value (global gfx)';
    expect(redactAbsolutePaths(msg, '/any/project')).toBe(msg);
  });
});
