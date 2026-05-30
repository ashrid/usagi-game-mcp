import { describe, it, expect } from 'vitest';
import { parseFallbackRegex, sanitizeConfigStrings } from '../../../src/sandbox/config-parser.js';

describe('parseFallbackRegex', () => {
  it('extracts flat literal fields from a simple _config()', () => {
    const src = `return {
  game_id = "my_game",
  width = 320,
  height = 180,
  sprite_size = 16,
}`;
    const result = parseFallbackRegex(src);
    expect(result.config['game_id']).toBe('my_game');
    expect(result.config['width']).toBe(320);
    expect(result.config['height']).toBe(180);
    expect(result.config['sprite_size']).toBe(16);
  });

  it('reports missing fields when a known key is absent', () => {
    const result = parseFallbackRegex('return { game_id = "test" }');
    expect(result.missing_fields).toContain('width');
    expect(result.missing_fields).toContain('height');
  });

  it('returns empty config for complex non-literal tables', () => {
    const result = parseFallbackRegex('local x = 5 return { width = x * 2 }');
    expect(result.config['width']).toBeUndefined();
  });
});

describe('sanitizeConfigStrings', () => {
  it('truncates strings longer than 1024 chars', () => {
    const config = { title: 'a'.repeat(2000) };
    const result = sanitizeConfigStrings(config);
    expect((result['title'] as string).length).toBe(1024);
  });

  it('strips ESC bytes from strings', () => {
    const config = { title: 'Hello\x1bWorld' };
    const result = sanitizeConfigStrings(config);
    expect(result['title']).toBe('Hello[non-printable stripped]World');
  });
});
