interface CacheEntry {
  resolved: string;
  expiresAt: number;
  lastAccessed: number;
}

interface PathCacheOptions {
  maxSize?: number;
  ttlMs?: number;
}

export class PathCache {
  private map = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(opts: PathCacheOptions = {}) {
    this.maxSize = opts.maxSize ?? 500;
    this.ttlMs = opts.ttlMs ?? 30_000;
  }

  get(rawPath: string): string | undefined {
    const entry = this.map.get(rawPath);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.map.delete(rawPath);
      return undefined;
    }
    entry.lastAccessed = Date.now();
    // Move to end (most recently used)
    this.map.delete(rawPath);
    this.map.set(rawPath, entry);
    return entry.resolved;
  }

  set(rawPath: string, resolved: string): void {
    // Evict LRU if at capacity
    if (this.map.size >= this.maxSize && !this.map.has(rawPath)) {
      const lruKey = this.map.keys().next().value;
      if (lruKey !== undefined) this.map.delete(lruKey);
    }
    this.map.set(rawPath, {
      resolved,
      expiresAt: Date.now() + this.ttlMs,
      lastAccessed: Date.now(),
    });
  }

  invalidate(rawPath: string): void {
    this.map.delete(rawPath);
  }

  invalidateAll(): void {
    this.map.clear();
  }
}
