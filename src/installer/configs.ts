import * as os from 'node:os';
import * as path from 'node:path';

export function getConfigPath(cliId: string): string {
  const home = os.homedir();
  const platform = process.platform;
  const appdata = process.env['APPDATA'] ?? home;
  const userprofile = process.env['USERPROFILE'] ?? home;

  switch (cliId) {
    case 'claude-code':
      return path.join(home, '.claude', 'settings.json');

    case 'claude-desktop':
      if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
      if (platform === 'win32') return path.join(appdata, 'Claude', 'claude_desktop_config.json');
      return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');

    case 'cursor':
      return path.join(home, '.cursor', 'mcp.json');

    case 'windsurf':
      if (platform === 'win32') return path.join(userprofile, '.codeium', 'windsurf', 'mcp_config.json');
      return path.join(home, '.codeium', 'windsurf', 'mcp_config.json');

    case 'opencode':
      return path.join(home, '.config', 'opencode', 'opencode.json');

    case 'codex':
      return path.join(home, '.codex', 'config.toml');

    case 'copilot':
      return path.join(home, '.copilot', 'mcp-config.json');

    case 'qwen':
      return path.join(home, '.qwen', 'settings.json');

    case 'antigravity':
      if (platform === 'win32') return path.join(userprofile, '.gemini', 'antigravity', 'mcp_config.json');
      return path.join(home, '.gemini', 'antigravity-cli', 'mcp_config.json');

    case 'pi':
      return '';

    default:
      throw new Error(`Unknown CLI id: ${cliId}`);
  }
}
