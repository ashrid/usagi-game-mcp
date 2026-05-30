import checkbox from '@inquirer/checkbox';
import * as readline from 'node:readline/promises';
import { detectCLIs } from './detect.js';
import { getConfigPath } from './configs.js';
import { writeJsonConfig } from './writers/json-writer.js';
import { writeOpenCodeConfig } from './writers/opencode-writer.js';
import { writeTomlConfig } from './writers/toml-writer.js';
import type { DetectedCLI } from './detect.js';

const SERVER_NAME = 'usagi-game-mcp';

export async function runInstaller(): Promise<void> {
  console.error('\n╔══════════════════════════════════════╗');
  console.error('║     Usagi Game MCP Installer         ║');
  console.error('╚══════════════════════════════════════╝\n');

  console.error('Scanning for installed CLIs...\n');
  const detected = await detectCLIs();

  if (detected.length === 0) {
    console.error('No CLIs detected. Add this entry manually:\n');
    printManualSnippets(undefined);
    return;
  }

  // Checkbox selection — all detected CLIs pre-checked
  const selected: string[] = await checkbox({
    message: 'Select CLIs to configure:',
    choices: detected.map(cli => ({
      name: `${cli.label.padEnd(22)} ${cli.writer === 'manual' ? '(manual instructions only)' : cli.configPath}`,
      value: cli.id,
      checked: true,
    })),
  });

  if (selected.length === 0) {
    console.error('\nNothing selected. Exiting.');
    return;
  }

  // Optional folder prompt
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  const sep = process.platform === 'win32' ? ';' : ':';
  const folderInput = await rl.question(
    `\n? Usagi projects folder (press Enter to skip, separate multiple with "${sep}"):\n  > `
  );
  rl.close();
  const allowedRoots = folderInput.trim() || undefined;

  console.error('\nInstalling...');

  const selectedCLIs = detected.filter(c => selected.includes(c.id));
  for (const cli of selectedCLIs) {
    await installCLI(cli, allowedRoots);
  }

  if (!allowedRoots) {
    console.error('\n  ℹ No project folder set — the server defaults to the current working directory.');
    console.error('    To add one later, tell your agent:');
    console.error(`    "Set USAGI_ALLOWED_ROOTS to /path/to/games and re-run: npx ${SERVER_NAME} install"`);
  }

  console.error('\nRestart your CLI tools to activate the server.\n');
}

async function installCLI(cli: DetectedCLI, allowedRoots?: string): Promise<void> {
  if (cli.writer === 'manual') {
    console.error(`\n  ℹ ${cli.label}: install pi-mcp-adapter extension, then add:`);
    console.error(`      command: npx -y ${SERVER_NAME}`);
    if (allowedRoots) console.error(`      env:     USAGI_ALLOWED_ROOTS=${allowedRoots}`);
    return;
  }

  const configPath = getConfigPath(cli.id);

  try {
    let result: string;
    if (cli.writer === 'json') result = await writeJsonConfig(configPath, allowedRoots);
    else if (cli.writer === 'opencode') result = await writeOpenCodeConfig(configPath, allowedRoots);
    else result = await writeTomlConfig(configPath, allowedRoots);

    const tag =
      result === 'skipped' ? '(already installed, skipped)' :
      result === 'parse-error' ? '(skipped — config file could not be parsed)' :
      `(${result})`;

    const icon = result === 'parse-error' ? '  ✗' : '  ✓';
    console.error(`${icon} ${cli.label.padEnd(22)} → ${configPath}  ${tag}`);
  } catch (e) {
    console.error(`  ✗ ${cli.label.padEnd(22)} → failed: ${String(e)}`);
  }
}

function printManualSnippets(allowedRoots: string | undefined): void {
  const envLine = allowedRoots ? `,\n        "env": { "USAGI_ALLOWED_ROOTS": "${allowedRoots}" }` : '';
  console.error('  Claude Code / Desktop / Cursor / Windsurf / Copilot / Qwen / AntiGravity:');
  console.error(`  {\n    "mcpServers": {\n      "${SERVER_NAME}": {\n        "command": "npx",\n        "args": ["-y", "${SERVER_NAME}"]${envLine}\n      }\n    }\n  }\n`);
  console.error('  OpenCode (~/.config/opencode/opencode.json):');
  console.error(`  {\n    "mcp": {\n      "${SERVER_NAME}": { "type": "local", "command": ["npx", "-y", "${SERVER_NAME}"], "enabled": true }\n    }\n  }\n`);
  console.error('  Codex CLI (~/.codex/config.toml):');
  console.error(`  [mcp_servers.${SERVER_NAME}]\n  command = "npx"\n  args = ["-y", "${SERVER_NAME}"]`);
}
