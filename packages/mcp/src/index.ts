#!/usr/bin/env node
export { startMcpServer } from './server.js';

import { startMcpServer } from './server.js';

const isMain =
  process.argv[1]?.includes('agentos-mcp') ||
  process.argv[1]?.includes('mcp/dist/index');

if (isMain) {
  startMcpServer().catch((err) => {
    console.error('agentos-mcp:', err);
    process.exit(1);
  });
}
