import { Command } from 'commander';

export const mcpCommand = new Command('mcp')
  .description('Start the AgentOS MCP server (stdio)')
  .action(async () => {
    const { startMcpServer } = await import('@agentos-sui/mcp/server');
    await startMcpServer();
  });
