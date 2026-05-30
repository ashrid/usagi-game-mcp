import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { getConfigPath } from './configs.js';

export type WriterType = 'json' | 'opencode' | 'toml' | 'manual';

export interface DetectedCLI {
  id: string;
  label: string;
  configPath: string;
  writer: WriterType;
}

interface CLIDefinition {
  id: string;
  label: string;
  detectionDir: (home: string) => string;
  writer: WriterType;
}

const CLI_DEFINITIONS: CLIDefinition[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    detectionDir: (home) => path.join(home, '.claude'),
    writer: 'json',
  },
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    detectionDir: (home) => {
      const platform = process.platform;
      if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Claude');
      if (platform === 'win32') return path.join(home, 'AppData', 'Roaming', 'Claude');
      return path.join(home, '.config', 'Claude');
    },
    writer: 'json',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    detectionDir: (home) => path.join(home, '.cursor'),
    writer: 'json',
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    detectionDir: (home) => path.join(home, '.codeium', 'windsurf'),
    writer: 'json',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    detectionDir: (home) => path.join(home, '.config', 'opencode'),
    writer: 'opencode',
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    detectionDir: (home) => path.join(home, '.codex'),
    writer: 'toml',
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot CLI',
    detectionDir: (home) => path.join(home, '.copilot'),
    writer: 'json',
  },
  {
    id: 'qwen',
    label: 'Qwen Code',
    detectionDir: (home) => path.join(home, '.qwen'),
    writer: 'json',
  },
  {
    id: 'antigravity',
    label: 'AntiGravity',
    detectionDir: (home) => {
      if (process.platform === 'win32') {
        return path.join(home, '.gemini', 'antigravity');
      }
      return path.join(home, '.gemini', 'antigravity-cli');
    },
    writer: 'json',
  },
  {
    id: 'pi',
    label: 'Pi',
    detectionDir: (home) => path.join(home, '.pi'),
    writer: 'manual',
  },
];

export async function detectCLIs(homeDir: string = os.homedir()): Promise<DetectedCLI[]> {
  const detected: DetectedCLI[] = [];
  for (const def of CLI_DEFINITIONS) {
    try {
      await fs.access(def.detectionDir(homeDir));
      detected.push({
        id: def.id,
        label: def.label,
        configPath: getConfigPath(def.id),
        writer: def.writer,
      });
    } catch {
      // not installed
    }
  }
  return detected;
}
