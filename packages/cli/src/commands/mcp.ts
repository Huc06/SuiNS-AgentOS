import { Command } from 'commander';

export const mcpCommand = new Command('mcp')
  .description('Start the AgentOS MCP server (stdio)')
  .action(async () => {
    const { startMcpServer } = await import('@agentos/mcp/server');
    await startMcpServer();
  });
