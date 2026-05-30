import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const SERVER_NAME = 'usagi-game-mcp';

export type WriteResult = 'created' | 'merged' | 'skipped';

export async function writeTomlConfig(filePath: string, allowedRoots?: string): Promise<WriteResult> {
  let existing = '';
  let existed = false;

  try {
    existing = await fs.readFile(filePath, 'utf8');
    existed = true;
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code !== 'ENOENT') throw e;
  }

  if (existing.includes(`[mcp_servers.${SERVER_NAME}]`)) return 'skipped';

  const section = buildSection(allowedRoots);
  const newContent = existed ? existing.trimEnd() + '\n\n' + section : section;

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, newContent, 'utf8');
  return existed ? 'merged' : 'created';
}

function buildSection(allowedRoots?: string): string {
  let section = `[mcp_servers.${SERVER_NAME}]\ncommand = "npx"\nargs = ["-y", "${SERVER_NAME}"]\n`;
  if (allowedRoots) {
    const escaped = allowedRoots.replace(/\\/g, '\\\\');
    section += `\n[mcp_servers.${SERVER_NAME}.env]\nUSAGI_ALLOWED_ROOTS = "${escaped}"\n`;
  }
  return section;
}
