import * as path from 'path';
import { Jimp } from 'jimp';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validatePath, ValidationMode } from '../security/path-validator.js';
import type { PathCache } from '../security/path-cache.js';
import { makeError } from '../errors.js';

interface PaletteSlot {
  slot: number;
  r: number;
  g: number;
  b: number;
  a: number;
  hex: string;
}

export function registerPaletteResource(server: McpServer, deps: { allowedRoots: string[]; pathCache: PathCache }): void {
  server.resource(
    'usagi-project-palette',
    new ResourceTemplate('usagi://project/{projectPath}/palette', { list: undefined }),
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
        throw new Error(JSON.stringify(makeError('asset_not_found', 'sprites.png not found in project root')));
      }

      const slots: PaletteSlot[] = [];
      const spriteSize = 16; // default; ideally read from config
      const maxSlots = Math.min(16, Math.floor(image.width / spriteSize));

      for (let i = 0; i < maxSlots; i++) {
        const x = i * spriteSize;
        const y = 0;
        const pixel = image.getPixelColor(x, y);
        const r = (pixel >> 24) & 0xff;
        const g = (pixel >> 16) & 0xff;
        const b = (pixel >> 8) & 0xff;
        const a = pixel & 0xff;
        const hex = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
        slots.push({ slot: i, r, g, b, a, hex });
      }

      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ palette: slots }) }] };
    }
  );
}
