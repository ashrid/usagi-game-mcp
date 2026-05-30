import { describe, it, expect } from 'vitest';
import { validateIdentifier, generateEntityScaffold, generateStateScaffold, generateStateMachineScaffold, generateSaveSystemScaffold } from '../../../src/tools/scaffold-tools.js';

describe('validateIdentifier', () => {
  it('accepts valid Lua identifiers', () => {
    expect(validateIdentifier('Player')).toBe(true);
    expect(validateIdentifier('my_entity_2')).toBe(true);
    expect(validateIdentifier('_internal')).toBe(true);
  });

  it('rejects invalid identifiers', () => {
    expect(validateIdentifier('123invalid')).toBe(false);
    expect(validateIdentifier('has space')).toBe(false);
    expect(validateIdentifier('end\n_G.os=x')).toBe(false);
    expect(validateIdentifier('')).toBe(false);
    expect(validateIdentifier('has-dash')).toBe(false);
  });
});

describe('generateEntityScaffold', () => {
  it('contains the entity name', () => {
    const src = generateEntityScaffold('Player', 0, false);
    expect(src).toContain('Player');
    expect(src).toContain('function');
  });

  it('includes collision rect when has_collision is true', () => {
    const src = generateEntityScaffold('Enemy', 1, true);
    expect(src).toContain('rect');
  });
});

describe('generateStateScaffold', () => {
  it('generates init/update/draw stubs', () => {
    const src = generateStateScaffold('GameOver');
    expect(src).toContain('GameOver');
    expect(src).toContain('function');
    expect(src).toContain('init');
    expect(src).toContain('update');
    expect(src).toContain('draw');
  });
});

describe('generateStateMachineScaffold', () => {
  it('includes all provided states', () => {
    const src = generateStateMachineScaffold('GameState', ['menu', 'playing', 'dead']);
    expect(src).toContain('menu');
    expect(src).toContain('playing');
    expect(src).toContain('dead');
  });
});

describe('generateSaveSystemScaffold', () => {
  it('includes all fields with defaults', () => {
    const src = generateSaveSystemScaffold([
      { name: 'score', default: 0 },
      { name: 'name', default: 'player' },
    ]);
    expect(src).toContain('score');
    expect(src).toContain('name');
    expect(src).toContain('0');
    expect(src).toContain('"player"');
  });
});
