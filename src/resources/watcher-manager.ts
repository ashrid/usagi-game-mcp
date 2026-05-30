import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import { PathCache } from '../security/path-cache.js';

const MAX_WATCHERS = 20;

const IGNORED_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/*.tmp',
  '**/*.log',
  'dist/**',
  'build/**',
  '**/*.swp',
  '**/.DS_Store',
  '.usagi-mcp/**',
];

interface WatcherEntry {
  watcher: FSWatcher;
  projectPath: string;
  lastAccessed: number;
  changeCallbacks: Set<(event: string, filePath: string) => void>;
}

export class WatcherManager {
  private watchers = new Map<string, WatcherEntry>();
  private pathCache: PathCache;

  constructor(pathCache: PathCache) {
    this.pathCache = pathCache;
  }

  watch(projectPath: string, onChange: (event: string, filePath: string) => void): void {
    let entry = this.watchers.get(projectPath);
    if (entry) {
      entry.lastAccessed = Date.now();
      entry.changeCallbacks.add(onChange);
      return;
    }

    // Evict LRU if at capacity
    if (this.watchers.size >= MAX_WATCHERS) {
      this.evictLru();
    }

    const watcher = chokidar.watch(projectPath, {
      ignored: IGNORED_PATTERNS,
      ignoreInitial: true,
      persistent: false,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    });

    const callbacks = new Set<(event: string, filePath: string) => void>();
    callbacks.add(onChange);

    const pathCache = this.pathCache;
    const notifyCallbacks = (event: string, filePath: string) => {
      pathCache.invalidate(filePath);
      for (const cb of callbacks) {
        cb(event, filePath);
      }
    };

    (watcher as any).on('add', (filePath: string) => notifyCallbacks('add', filePath));
    (watcher as any).on('change', (filePath: string) => notifyCallbacks('change', filePath));
    (watcher as any).on('unlink', (filePath: string) => notifyCallbacks('unlink', filePath));
    (watcher as any).on('rename', (filePath: string) => notifyCallbacks('rename', filePath));

    entry = { watcher, projectPath, lastAccessed: Date.now(), changeCallbacks: callbacks };
    this.watchers.set(projectPath, entry);
  }

  unwatch(projectPath: string, onChange: (event: string, filePath: string) => void): void {
    const entry = this.watchers.get(projectPath);
    if (!entry) return;
    entry.changeCallbacks.delete(onChange);
    if (entry.changeCallbacks.size === 0) {
      entry.watcher.close();
      this.watchers.delete(projectPath);
    }
  }

  private evictLru(): void {
    let oldest: [string, WatcherEntry] | null = null;
    for (const entry of this.watchers.entries()) {
      if (!oldest || entry[1].lastAccessed < oldest[1].lastAccessed) {
        oldest = entry;
      }
    }
    if (oldest) {
      oldest[1].watcher.close();
      this.watchers.delete(oldest[0]);
    }
  }

  closeAll(): void {
    for (const entry of this.watchers.values()) {
      entry.watcher.close();
    }
    this.watchers.clear();
  }
}
