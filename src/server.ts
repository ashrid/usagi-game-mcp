import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PathCache } from './security/path-cache.js';
import { WatcherManager } from './resources/watcher-manager.js';
import { RateLimiter } from './rate-limiter.js';

const CWD = process.cwd();

export function getAllowedRoots(): string[] {
  const env = process.env['USAGI_ALLOWED_ROOTS'];
  if (!env) {
    console.error(`[usagi-mcp] USAGI_ALLOWED_ROOTS not set — defaulting to CWD (${CWD}). Set USAGI_ALLOWED_ROOTS to expand or restrict project access.`);
    return [CWD];
  }
  return env.split(process.platform === 'win32' ? ';' : ':').filter(Boolean);
}

export async function createServer(): Promise<{ server: McpServer; transport: StdioServerTransport; shutdown: () => Promise<void> }> {
  const allowedRoots = getAllowedRoots();
  const pathCache = new PathCache();
  const watcherManager = new WatcherManager(pathCache);
  const rateLimiter = new RateLimiter({
    requestsPerMinute: parseInt(process.env['USAGI_MCP_RATE_LIMIT'] ?? '60', 10),
  });

  const server = new McpServer({
    name: 'usagi-mcp',
    version: '0.1.0',
  });

  // Resources and tools are registered by separate modules (added in Tasks 11-24).
  // Each registration call receives (server, { allowedRoots, pathCache, watcherManager, rateLimiter }).

  const transport = new StdioServerTransport();

  const shutdown = async (): Promise<void> => {
    watcherManager.closeAll();
    await server.close();
  };

  process.on('SIGTERM', () => { void shutdown().then(() => process.exit(0)); });
  process.on('SIGINT', () => { void shutdown().then(() => process.exit(0)); });

  return { server, transport, shutdown };
}
