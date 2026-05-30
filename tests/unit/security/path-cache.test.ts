import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PathCache } from '../../../src/security/path-cache.js';

describe('PathCache', () => {
  let cache: PathCache;

  beforeEach(() => {
    cache = new PathCache({ maxSize: 3, ttlMs: 100 });
  });

  it('returns undefined for cache miss', () => {
    expect(cache.get('/some/path')).toBeUndefined();
  });

  it('returns cached value on hit', () => {
    cache.set('/project/file.lua', '/resolved/project/file.lua');
    expect(cache.get('/project/file.lua')).toBe('/resolved/project/file.lua');
  });

  it('evicts the least-recently-used entry when full', () => {
    cache.set('/a', '/ra');
    cache.set('/b', '/rb');
    cache.set('/c', '/rc');
    // Access /a to make it recently used
    cache.get('/a');
    // Adding /d should evict /b (LRU)
    cache.set('/d', '/rd');
    expect(cache.get('/b')).toBeUndefined();
    expect(cache.get('/a')).toBe('/ra');
    expect(cache.get('/d')).toBe('/rd');
  });

  it('expires entries after TTL', async () => {
    cache.set('/project/file.lua', '/resolved');
    await new Promise(r => setTimeout(r, 150));
    expect(cache.get('/project/file.lua')).toBeUndefined();
  });

  it('invalidates by path on unlink/rename/add/change events', () => {
    cache.set('/project/file.lua', '/resolved/project/file.lua');
    cache.invalidate('/project/file.lua');
    expect(cache.get('/project/file.lua')).toBeUndefined();
  });
});
