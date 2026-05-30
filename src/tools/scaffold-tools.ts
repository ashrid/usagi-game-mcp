import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { validatePath, ValidationMode } from '../security/path-validator.js';
import { withFileLock } from './lock-manager.js';

export function validateIdentifier(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

export function generateEntityScaffold(entityName: string, spriteIndex: number, hasCollision: boolean): string {
  const collisionBlock = hasCollision ? `\n-- Collision rectangle (x, y, w, h relative to entity position)\n${entityName}.rect = {0, 0, 8, 8}\n` : '';
  return `-- ${entityName} entity
local ${entityName} = {}
${entityName}.__index = ${entityName}

function ${entityName}.new(x, y)
  local self = setmetatable({}, ${entityName})
  self.x = x
  self.y = y
  self.sprite = ${spriteIndex}
  return self
end
${collisionBlock}
function ${entityName}:init()
end

function ${entityName}:update(dt)
end

function ${entityName}:draw()
  usagi.gfx.spr(self.sprite, self.x, self.y)
end

return ${entityName}
`;
}

export function generateStateScaffold(stateName: string, imports: string[] = []): string {
  const importLines = imports.map(i => `local ${i} = require("${i}")`).join('\n');
  return `-- ${stateName} state${importLines ? '\n' + importLines : ''}

local ${stateName} = {}

function ${stateName}.init()
end

function ${stateName}.update(dt)
end

function ${stateName}.draw(dt)
end

return ${stateName}
`;
}

export function generateStateMachineScaffold(moduleName: string, states: string[]): string {
  const stateVars = states.map(s => `  ${s} = "${s}",`).join('\n');
  const firstState = states[0] ?? 'idle';
  return `-- ${moduleName} state machine
local ${moduleName} = {}

local States = {
${stateVars}
}

local current = States.${firstState}

function ${moduleName}.set(state)
  current = state
end

function ${moduleName}.get()
  return current
end

return ${moduleName}
`;
}

export function generateCollisionHandlerScaffold(moduleName: string, shapeA: string, shapeB: string): string {
  const paramDesc = shapeA === 'rect' ? 'x, y, w, h' : 'x, y, r';
  return `-- ${moduleName} collision handler (${shapeA} vs ${shapeB})
local ${moduleName} = {}

-- Returns true if a and b overlap
-- a, b: { ${paramDesc} }
function ${moduleName}.check(a, b)
  -- TODO: implement ${shapeA}-${shapeB} collision detection
  return false
end

function ${moduleName}.resolve(a, b)
  -- TODO: implement ${shapeA}-${shapeB} collision resolution
end

return ${moduleName}
`;
}

export function generateSaveSystemScaffold(
  fields: Array<{ name: string; default: string | number | boolean | null }>
): string {
  const defaults = fields.map(f => {
    const val = f.default === null ? 'nil'
      : typeof f.default === 'string' ? `"${f.default}"`
      : String(f.default);
    return `  ${f.name} = ${val},`;
  }).join('\n');

  return `-- Save system
local Save = {}

local defaults = {
${defaults}
}

function Save.load()
  local data = usagi.load() or {}
  for k, v in pairs(defaults) do
    if data[k] == nil then data[k] = v end
  end
  return data
end

function Save.save(data)
  usagi.save(data)
end

function Save.reset()
  usagi.save(defaults)
end

return Save
`;
}

async function writeScaffoldFile(
  resolvedProjectPath: string,
  outputPath: string,
  source: string,
  overwrite: boolean
): Promise<{ filename: string; path: string; source: string }> {
  const fv = await validatePath(outputPath, [resolvedProjectPath], ValidationMode.Write);
  if (!fv.ok) throw fv.error;

  await fs.mkdir(path.dirname(fv.resolvedPath), { recursive: true });

  let exists = false;
  try { await fs.access(fv.resolvedPath); exists = true; } catch { /* new */ }
  if (exists && !overwrite) {
    throw Object.assign(new Error('File exists'), { type: 'file_exists', path: fv.resolvedPath });
  }

  if (!exists) await fs.writeFile(fv.resolvedPath, '', 'utf8');

  return withFileLock(fv.resolvedPath, async () => {
    const tmp = fv.resolvedPath + '_tmp_' + randomBytes(8).toString('hex');
    await fs.writeFile(tmp, source, 'utf8');
    await fs.rename(tmp, fv.resolvedPath);
    return { filename: path.basename(fv.resolvedPath), path: fv.resolvedPath, source };
  }, { content: source });
}

function okResponse(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}
function errResponse(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }], isError: true as const };
}

export function registerScaffoldTools(
  server: McpServer,
  { allowedRoots }: { allowedRoots: string[] }
): void {

  server.tool(
    'usagi_init_project',
    'Initialize a new Usagi project by running `usagi init`.',
    { project_path: z.string(), name: z.string() },
    async ({ project_path, name }) => {
      if (!validateIdentifier(name)) {
        return errResponse({ type: 'invalid_parameter', reason: 'invalid_identifier', name });
      }
      const v = await validatePath(project_path, allowedRoots, ValidationMode.Read);
      if (!v.ok) return errResponse(v.error);
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execP = promisify(execFile);
      try {
        const { stdout } = await execP('usagi', ['init', v.resolvedPath, '--name', name], { timeout: 30_000 });
        const files_created = stdout.split('\n').filter(Boolean);
        return okResponse({ success: true, project_path: v.resolvedPath, files_created });
      } catch (e: unknown) {
        const err = e as { killed?: boolean; stderr?: string };
        if (err.killed) return errResponse({ type: 'subprocess_timeout', command: 'usagi init' });
        return errResponse({ type: 'init_failed', message: err.stderr ?? String(e) });
      }
    }
  );

  server.tool(
    'usagi_scaffold_entity',
    'Generate a Lua entity module.',
    {
      project_path: z.string(),
      entity_name: z.string(),
      sprite_index: z.number().optional().default(0),
      has_collision: z.boolean().optional().default(false),
      output_path: z.string().optional(),
      overwrite: z.boolean().optional().default(false),
    },
    async ({ project_path, entity_name, sprite_index, has_collision, output_path, overwrite }) => {
      if (!validateIdentifier(entity_name)) return errResponse({ type: 'invalid_parameter', reason: 'invalid_identifier', name: entity_name });
      const v = await validatePath(project_path, allowedRoots, ValidationMode.Read);
      if (!v.ok) return errResponse(v.error);
      const relPath = output_path ?? `entities/${entity_name.toLowerCase()}.lua`;
      const absPath = path.join(v.resolvedPath, relPath);
      const source = generateEntityScaffold(entity_name, sprite_index, has_collision);
      try { return okResponse(await writeScaffoldFile(v.resolvedPath, absPath, source, overwrite)); }
      catch (e) { return errResponse(e); }
    }
  );

  server.tool(
    'usagi_scaffold_state',
    'Generate a Lua game-flow state module.',
    {
      project_path: z.string(),
      state_name: z.string(),
      imports: z.array(z.string()).optional().default([]),
      overwrite: z.boolean().optional().default(false),
    },
    async ({ project_path, state_name, imports, overwrite }) => {
      if (!validateIdentifier(state_name)) return errResponse({ type: 'invalid_parameter', reason: 'invalid_identifier', name: state_name });
      const v = await validatePath(project_path, allowedRoots, ValidationMode.Read);
      if (!v.ok) return errResponse(v.error);
      const absPath = path.join(v.resolvedPath, `states/${state_name.toLowerCase()}.lua`);
      const source = generateStateScaffold(state_name, imports);
      try { return okResponse(await writeScaffoldFile(v.resolvedPath, absPath, source, overwrite)); }
      catch (e) { return errResponse(e); }
    }
  );

  server.tool(
    'usagi_scaffold_state_machine',
    'Generate a Lua state machine module.',
    {
      project_path: z.string(),
      module_name: z.string(),
      states: z.array(z.string()),
      overwrite: z.boolean().optional().default(false),
    },
    async ({ project_path, module_name, states, overwrite }) => {
      if (!validateIdentifier(module_name)) return errResponse({ type: 'invalid_parameter', reason: 'invalid_identifier', name: module_name });
      const v = await validatePath(project_path, allowedRoots, ValidationMode.Read);
      if (!v.ok) return errResponse(v.error);
      const absPath = path.join(v.resolvedPath, `${module_name.toLowerCase()}.lua`);
      const source = generateStateMachineScaffold(module_name, states);
      try { return okResponse(await writeScaffoldFile(v.resolvedPath, absPath, source, overwrite)); }
      catch (e) { return errResponse(e); }
    }
  );

  server.tool(
    'usagi_scaffold_collision_handler',
    'Generate a Lua collision handler module.',
    {
      project_path: z.string(),
      module_name: z.string(),
      shape_a: z.enum(['rect', 'circle']),
      shape_b: z.enum(['rect', 'circle']),
      overwrite: z.boolean().optional().default(false),
    },
    async ({ project_path, module_name, shape_a, shape_b, overwrite }) => {
      if (!validateIdentifier(module_name)) return errResponse({ type: 'invalid_parameter', reason: 'invalid_identifier', name: module_name });
      const v = await validatePath(project_path, allowedRoots, ValidationMode.Read);
      if (!v.ok) return errResponse(v.error);
      const absPath = path.join(v.resolvedPath, `${module_name.toLowerCase()}.lua`);
      const source = generateCollisionHandlerScaffold(module_name, shape_a, shape_b);
      try { return okResponse(await writeScaffoldFile(v.resolvedPath, absPath, source, overwrite)); }
      catch (e) { return errResponse(e); }
    }
  );

  server.tool(
    'usagi_scaffold_save_system',
    'Generate a Lua save system module.',
    {
      project_path: z.string(),
      fields: z.array(z.object({
        name: z.string(),
        default: z.union([z.string(), z.number(), z.boolean(), z.null()]),
      })),
      overwrite: z.boolean().optional().default(false),
    },
    async ({ project_path, fields, overwrite }) => {
      const v = await validatePath(project_path, allowedRoots, ValidationMode.Read);
      if (!v.ok) return errResponse(v.error);
      const absPath = path.join(v.resolvedPath, 'save.lua');
      const source = generateSaveSystemScaffold(fields);
      try { return okResponse(await writeScaffoldFile(v.resolvedPath, absPath, source, overwrite)); }
      catch (e) { return errResponse(e); }
    }
  );
}
