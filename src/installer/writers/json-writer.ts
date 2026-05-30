import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const SERVER_NAME = 'usagi-game-mcp';

export type WriteResult = 'created' | 'merged' | 'skipped' | 'parse-error';

export async function writeJsonConfig(filePath: string, allowedRoots?: string): Promise<WriteResult> {
  let existing: Record<string, unknown> = {};
  let existed = false;

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    existed = true;
    existing = JSON.parse(raw) as Record<string, unknown>;
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code !== 'ENOENT') return 'parse-error';
  }

  const servers = (existing['mcpServers'] as Record<string, unknown> | undefined) ?? {};
  if (SERVER_NAME in servers) return 'skipped';

  const entry: Record<string, unknown> = {
    command: 'npx',
    args: ['-y', SERVER_NAME],
  };
  if (allowedRoots) entry['env'] = { USAGI_ALLOWED_ROOTS: allowedRoots };

  servers[SERVER_NAME] = entry;
  existing['mcpServers'] = servers;

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(existing, null, 2), 'utf8');
  return existed ? 'merged' : 'created';
}
