const READ_ONLY_TOOLS = new Set([
  'usagi_dev_status',
  'usagi_read_log',
  'usagi_check_version',
  'usagi_lint',
  'usagi_validate_project',
  'usagi_serve_list',
]);

interface RateLimiterOptions {
  requestsPerMinute: number;
}

export class RateLimiter {
  private tokens: number;
  private readonly max: number;
  private lastRefill: number;
  private readonly refillIntervalMs: number;

  constructor(opts: RateLimiterOptions) {
    this.max = opts.requestsPerMinute;
    this.tokens = this.max;
    this.lastRefill = Date.now();
    this.refillIntervalMs = 60_000;
  }

  check(toolName: string): { allowed: boolean; retryAfterMs?: number } {
    if (this.max === 0) return { allowed: true };
    if (READ_ONLY_TOOLS.has(toolName)) return { allowed: true };

    this.refill();

    if (this.tokens > 0) {
      this.tokens--;
      return { allowed: true };
    }

    const retryAfterMs = this.refillIntervalMs - (Date.now() - this.lastRefill);
    return { allowed: false, retryAfterMs: Math.max(1, retryAfterMs) };
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed >= this.refillIntervalMs) {
      this.tokens = this.max;
      this.lastRefill = now;
    }
  }
}
