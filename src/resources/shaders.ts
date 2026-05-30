import * as fs from 'fs/promises';
import * as path from 'path';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validatePath, ValidationMode } from '../security/path-validator.js';
import type { PathCache } from '../security/path-cache.js';

interface UniformDecl {
  type: string;
  name: string;
}

interface ShaderInfo {
  name: string;
  version: string;
  uniforms: UniformDecl[];
}

export function registerShadersResource(server: McpServer, deps: { allowedRoots: string[]; pathCache: PathCache }): void {
  server.resource(
    'usagi-project-shaders',
    new ResourceTemplate('usagi://project/{projectPath}/shaders', { list: undefined }),
    { mimeType: 'application/json' },
    async (uri, variables) => {
      const raw = variables['projectPath'];
      const projectPath = decodeURIComponent(Array.isArray(raw) ? raw[0] ?? '' : raw ?? '');
      const validation = await validatePath(projectPath, deps.allowedRoots, ValidationMode.Read);
      if (!validation.ok) throw new Error(JSON.stringify(validation.error));

      const shadersDir = path.join(validation.resolvedPath, 'shaders');
      let files: string[] = [];
      try {
        files = (await fs.readdir(shadersDir)).filter(f => f.endsWith('.glsl'));
      } catch { /* no shaders dir */ }

      const shaders: ShaderInfo[] = [];
      for (const file of files) {
        const src = await fs.readFile(path.join(shadersDir, file), 'utf8').catch(() => '');
        const uniforms: UniformDecl[] = [];
        for (const m of src.matchAll(/^\s*uniform\s+(\w+)\s+(\w+)\s*;/gm)) {
          uniforms.push({ type: m[1], name: m[2] });
        }
        const versionMatch = src.match(/#version\s+(\d+(?:\s+\w+)?)/);
        const version = versionMatch ? versionMatch[1].trim() : 'unknown';
        shaders.push({ name: path.basename(file, '.glsl'), version, uniforms });
      }

      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify({ shaders }) }] };
    }
  );
}
