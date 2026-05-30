#!/usr/bin/env node
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
