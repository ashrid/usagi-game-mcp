import * as path from 'path';
import { Jimp } from 'jimp';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validatePath, ValidationMode } from '../security/path-validator.js';
import type { PathCache } from '../security/path-cache.js';
import { makeError } from '../errors.js';

export function registerSpritesheetResource(server: McpServer, deps: { allowedRoots: string[]; pathCache: PathCache }): void {
  server.resource(
    'usagi-project-spritesheet',
    new ResourceTemplate('usagi://project/{projectPath}/spritesheet', { list: undefined }),
    { mimeType: 'application/json' },
    async (uri, variables) => {
      const raw = variables['projectPath'];
      const projectPath = decodeURIComponent(Array.isArray(raw) ? raw[0] ?? '' : raw ?? '');
      const validation = await validatePath(projectPath, deps.allowedRoots, ValidationMode.Read);
      if (!validation.ok) throw new Error(JSON.stringify(validation.error));

      const spritesPath = path.join(validation.resolvedPath, 'sprites.png');
      let image: Awaited<ReturnType<typeof Jimp.read>>;
      try {
        image = await Jimp.read(spritesPath);
      } catch {
        throw new Error(JSON.stringify(makeError('asset_not_found', 'sprites.png not found')));
      }

      const spriteSize = 16; // default sprite size
      const cols = Math.floor(image.width / spriteSize);
      const rows = Math.floor(image.height / spriteSize);
      const total = cols * rows;

      // Detect empty sprites (all pixels fully transparent)
      const emptySlots: number[] = [];
      for (let idx = 0; idx < total; idx++) {
        const sx = (idx % cols) * spriteSize;
        const sy = Math.floor(idx / cols) * spriteSize;
        let isEmpty = true;
        for (let py = 0; py < spriteSize && isEmpty; py++) {
          for (let px = 0; px < spriteSize && isEmpty; px++) {
            const pixel = image.getPixelColor(sx + px, sy + py);
            if ((pixel & 0xff) !== 0) isEmpty = false;
          }
        }
        if (isEmpty) emptySlots.push(idx);
      }

      const payload = { width: image.width, height: image.height, sprite_size: spriteSize, cols, rows, total_sprites: total, empty_sprites: emptySlots };
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(payload) }] };
    }
  );
}
