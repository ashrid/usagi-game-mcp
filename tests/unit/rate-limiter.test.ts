import { describe, it, expect, vi, afterEach } from 'vitest';
import { RateLimiter } from '../../src/rate-limiter.js';

describe('RateLimiter', () => {
  afterEach(() => vi.useRealTimers());

  it('allows requests within the limit', () => {
    const limiter = new RateLimiter({ requestsPerMinute: 60 });
    const result = limiter.check('write_tool');
    expect(result.allowed).toBe(true);
  });

  it('blocks requests that exceed the limit', () => {
    const limiter = new RateLimiter({ requestsPerMinute: 2 });
    limiter.check('write_tool');
    limiter.check('write_tool');
    const result = limiter.check('write_tool');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('allows unlimited when requestsPerMinute is 0', () => {
    const limiter = new RateLimiter({ requestsPerMinute: 0 });
    for (let i = 0; i < 1000; i++) {
      expect(limiter.check('any').allowed).toBe(true);
    }
  });

  it('exempts read-only tools from rate limiting', () => {
    const limiter = new RateLimiter({ requestsPerMinute: 1 });
    limiter.check('usagi_write_lua'); // consume the 1 token
    // Read-only tools should still be allowed
    expect(limiter.check('usagi_dev_status').allowed).toBe(true);
    expect(limiter.check('usagi_read_log').allowed).toBe(true);
  });
});
