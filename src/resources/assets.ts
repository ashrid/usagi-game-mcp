import * as fs from 'fs/promises';
import * as path from 'path';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validatePath, ValidationMode } from '../security/path-validator.js';
import type { PathCache } from '../security/path-cache.js';

const SFX_EXT = new Set(['.wav']);
const MUSIC_EXT = new Set(['.ogg', '.mp3', '.wav', '.flac']);
const DATA_EXT = new Set(['.json', '.txt', '.csv']);

async function listDir(dirPath: string): Promise<string[]> {
  try {
    return await fs.readdir(dirPath);
  } catch { return []; }
}

export function registerAssetsResource(server: McpServer, deps: { allowedRoots: string[]; pathCache: PathCache }): void {
  server.resource(
    'usagi-project-assets',
    new ResourceTemplate('usagi://project/{projectPath}/assets', { list: undefined }),
    { mimeType: 'application/json' },
    async (uri, variables) => {
      const raw = variables['projectPath'];
      const projectPath = decodeURIComponent(Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? ''));
      const validation = await validatePath(projectPath, deps.allowedRoots, ValidationMode.Read);
      if (!validation.ok) throw new Error(JSON.stringify(validation.error));

      const root = validation.resolvedPath;
      const allFiles = await listDir(path.join(root, 'sfx'));
      const sfx = allFiles.filter(f => SFX_EXT.has(path.extname(f).toLowerCase())).map(f => path.basename(f, path.extname(f)));

      const musicFiles = await listDir(path.join(root, 'music'));
      const music = musicFiles.filter(f => MUSIC_EXT.has(path.extname(f).toLowerCase())).map(f => path.basename(f, path.extname(f)));

      const dataFiles = await listDir(path.join(root, 'data'));
      const data = dataFiles.filter(f => DATA_EXT.has(path.extname(f).toLowerCase()));

      const sprites = await fs.access(path.join(root, 'sprites.png')).then(() => true).catch(() => false);
      const palette = await fs.access(path.join(root, 'palette.png')).then(() => true).catch(() => false);
      const font = await fs.access(path.join(root, 'font.png')).then(() => true).catch(() => false);

      const shaderFiles = await listDir(path.join(root, 'shaders'));
      const shaders = shaderFiles.filter(f => f.endsWith('.glsl')).map(f => ({ name: path.basename(f, '.glsl') }));

      const payload = { sfx, music, data, sprites, palette, font, shaders };
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(payload) }] };
    }
  );
}
