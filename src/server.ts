import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PathCache } from './security/path-cache.js';
import { WatcherManager } from './resources/watcher-manager.js';
import { RateLimiter } from './rate-limiter.js';
import { registerConfigResource } from './resources/config.js';
import { registerStructureResource } from './resources/structure.js';
import { registerAssetsResource } from './resources/assets.js';
import { registerPaletteResource } from './resources/palette.js';
import { registerSpritesheetResource } from './resources/spritesheet.js';
import { registerShadersResource } from './resources/shaders.js';
import { registerFontResource } from './resources/font.js';
import { registerSaveResource } from './resources/save.js';
import { registerSettingsResource } from './resources/settings.js';
import { registerDevLogResource } from './resources/dev-log.js';
import { registerLuaFileResource } from './resources/lua-file.js';
import { registerDataFileResource } from './resources/data-file.js';
import { registerContextResource } from './resources/context.js';
import { registerDocsResource } from './resources/docs.js';
import { DevProcessManager } from './dev/dev-process-manager.js';
import { registerDevTools } from './tools/dev-tools.js';
import { registerFileTools } from './tools/file-tools.js';
import { registerRenameTools } from './tools/rename-tool.js';
import { registerValidateTools } from './tools/validate-tool.js';
import { registerScaffoldTools } from './tools/scaffold-tools.js';

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
  const devManager = new DevProcessManager();
  const rateLimiter = new RateLimiter({
    requestsPerMinute: parseInt(process.env['USAGI_MCP_RATE_LIMIT'] ?? '60', 10),
  });

  const server = new McpServer({
    name: 'usagi-mcp',
    version: '0.1.0',
  });

  registerConfigResource(server, { allowedRoots, pathCache });
  registerStructureResource(server, { allowedRoots, pathCache });
  registerAssetsResource(server, { allowedRoots, pathCache });
  registerPaletteResource(server, { allowedRoots, pathCache });
  registerSpritesheetResource(server, { allowedRoots, pathCache });
  registerShadersResource(server, { allowedRoots, pathCache });
  registerFontResource(server, { allowedRoots, pathCache });
  registerSaveResource(server, { allowedRoots, pathCache });
  registerSettingsResource(server, { allowedRoots, pathCache });
  registerDevLogResource(server, { allowedRoots, devManager });
  registerLuaFileResource(server, { allowedRoots, pathCache });
  registerDataFileResource(server, { allowedRoots, pathCache });
  registerContextResource(server, { allowedRoots, pathCache });
  registerDocsResource(server);
  registerDevTools(server, { allowedRoots, devManager });
  registerFileTools(server, { allowedRoots });
  registerRenameTools(server, { allowedRoots });
  registerValidateTools(server, { allowedRoots });
  registerScaffoldTools(server, { allowedRoots });

  const transport = new StdioServerTransport();

  const shutdown = async (): Promise<void> => {
    watcherManager.closeAll();
    await devManager.cleanupAll();
    await server.close();
  };

  process.on('SIGTERM', () => { void shutdown().then(() => process.exit(0)); });
  process.on('SIGINT', () => { void shutdown().then(() => process.exit(0)); });

  return { server, transport, shutdown };
}
