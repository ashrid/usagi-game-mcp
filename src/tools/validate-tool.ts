import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validatePath, ValidationMode } from '../security/path-validator.js';
import { parseFallbackRegex } from '../sandbox/config-parser.js';

interface ValidationError {
  type: string;
  file?: string;
  line?: number;
  message: string;
  hint?: string;
}

export async function validateProject(projectPath: string): Promise<{
  valid: boolean;
  scope: 'structural';
  runtime_validation: 'not_supported';
  errors: ValidationError[];
  limitations: string[];
}> {
  const errors: ValidationError[] = [];
  const mainLua = path.join(projectPath, 'main.lua');
  let mainSource = '';

  try {
    mainSource = await fs.readFile(mainLua, 'utf8');
  } catch {
    errors.push({
      type: 'missing_file',
      file: 'main.lua',
      message: 'main.lua is required but was not found.',
      hint: 'Create main.lua with _init(), _update(dt), and _draw(dt) functions.',
    });
  }

  if (mainSource) {
    for (const fn of ['_init', '_update', '_draw']) {
      if (!new RegExp(`function\\s+${fn}\\s*\\(`).test(mainSource)) {
        errors.push({
          type: 'missing_function',
          file: 'main.lua',
          message: `${fn}() is not defined in main.lua.`,
          hint: `Add: function ${fn}() end`,
        });
      }
    }

    if (/usagi\.save|usagi\.load/.test(mainSource)) {
      const parsed = parseFallbackRegex(mainSource);
      if (!parsed.config['game_id']) {
        errors.push({
          type: 'missing_config',
          file: 'main.lua',
          message: 'game_id is required in _config() when using usagi.save/load.',
          hint: 'Add game_id = "my_game" to the _config() return table.',
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    scope: 'structural',
    runtime_validation: 'not_supported',
    errors,
    limitations: [
      'Does not check Lua logic errors or runtime behavior',
      'Does not validate sprite indices referenced in code',
      'Does not detect game_id collisions with other installed games',
      'Does not check audio/shader file content validity',
    ],
  };
}

function okResponse(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}
function errResponse(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }], isError: true as const };
}

export function registerValidateTools(
  server: McpServer,
  { allowedRoots }: { allowedRoots: string[] }
): void {
  server.tool(
    'usagi_validate_project',
    'Structural validation of a Usagi project (does not execute code).',
    { project_path: z.string() },
    async ({ project_path }) => {
      const v = await validatePath(project_path, allowedRoots, ValidationMode.Read);
      if (!v.ok) return errResponse(v.error);
      const result = await validateProject(v.resolvedPath);
      return okResponse(result);
    }
  );
}
