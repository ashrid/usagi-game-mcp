#!/usr/bin/env node

if (process.argv[2] === 'install') {
  const { runInstaller } = await import('./installer/index.js');
  await runInstaller();
  process.exit(0);
}

import { createServer } from './server.js';

async function main(): Promise<void> {
  const { server, transport } = await createServer();
  await server.connect(transport);
  console.error('[usagi-mcp] Server connected and ready.');
}

main().catch(err => {
  console.error('[usagi-mcp] Fatal error:', err);
  process.exit(1);
});
