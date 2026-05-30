import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validatePath, ValidationMode } from '../security/path-validator.js';
import type { PathCache } from '../security/path-cache.js';

function getPlatformSavePath(gameId: string): string {
  if (process.platform === 'win32') {
    return path.join(process.env['APPDATA'] ?? os.homedir(), gameId);
  } else if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', gameId);
  } else {
    return path.join(os.homedir(), '.local', 'share', gameId);
  }
}

export function registerSaveResource(server: McpServer, deps: { allowedRoots: string[]; pathCache: PathCache }): void {
  server.resource(
    'usagi-project-save',
    new ResourceTemplate('usagi://project/{projectPath}/save', { list: undefined }),
    { mimeType: 'application/json' },
    async (uri, variables) => {
      const raw = variables['projectPath'];
      const projectPath = decodeURIComponent(Array.isArray(raw) ? raw[0] ?? '' : raw ?? '');
      const validation = await validatePath(projectPath, deps.allowedRoots, ValidationMode.Read);
      if (!validation.ok) throw new Error(JSON.stringify(validation.error));

      // Try to read game_id from project config candidates
      let gameId = 'usagi_game';
      for (const candidate of ['main.lua', 'config.lua', '_config.lua']) {
        try {
          const src = await fs.readFile(path.join(validation.resolvedPath, candidate), 'utf8');
          const m = src.match(/game_id\s*=\s*"([^"]+)"/);
          if (m) { gameId = m[1]; break; }
        } catch { /* try next */ }
      }

      // Sanitize: game_id must be a simple identifier, no path components
      if (!gameId || /[/\\]|\.\./.test(gameId) || gameId.length > 64) {
        gameId = 'usagi_game';
      }

      const savePath = getPlatformSavePath(gameId);
      let saveData: unknown = null;
      try {
        saveData = JSON.parse(await fs.readFile(path.join(savePath, 'save.json'), 'utf8'));
      } catch { /* no save file */ }

      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ game_id: gameId, save_path: savePath, data: saveData }) }] };
    }
  );
}
