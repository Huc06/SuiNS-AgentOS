import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { loadConfig, LocalRegistry, resolveRegistryPath } from '@agentos/sdk/node';

function openRegistry(): LocalRegistry {
  const cwd = process.cwd();
  const config = loadConfig(cwd);
  const path =
    process.env.AGENTOS_REGISTRY_PATH ?? resolveRegistryPath(config, cwd);
  return LocalRegistry.open(path);
}

export async function startMcpServer(): Promise<void> {
  const registry = openRegistry();

  const server = new Server(
    { name: 'agentos', version: '0.0.1' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'agentos_resolve',
        description: 'Resolve a SuiNS agent name to passport and registered skills',
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string', description: 'SuiNS name e.g. alpha.sui' } },
          required: ['name'],
        },
      },
      {
        name: 'agentos_register_agent',
        description: 'Register a new agent in the local registry (after Suiperpower deploy)',
        inputSchema: {
          type: 'object',
          properties: {
            suinsName: { type: 'string' },
            runtimeWallet: { type: 'string' },
            network: { type: 'string', enum: ['testnet', 'mainnet'] },
          },
          required: ['suinsName', 'runtimeWallet'],
        },
      },
      {
        name: 'agentos_publish_skill',
        description: 'Publish a skill manifest JSON string for an agent',
        inputSchema: {
          type: 'object',
          properties: {
            agentName: { type: 'string' },
            manifestJson: { type: 'string', description: 'Full sui-agent-skill/v1 JSON' },
            walrusBlob: { type: 'string' },
          },
          required: ['agentName', 'manifestJson'],
        },
      },
      {
        name: 'agentos_list_skills',
        description: 'List skills for an agent',
        inputSchema: {
          type: 'object',
          properties: { agentName: { type: 'string' } },
          required: ['agentName'],
        },
      },
      {
        name: 'agentos_dashboard_url',
        description: 'Get dashboard URL for an agent slug',
        inputSchema: {
          type: 'object',
          properties: { agentName: { type: 'string' } },
          required: ['agentName'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === 'agentos_resolve') {
        const { name: agentName } = z.object({ name: z.string() }).parse(args);
        const resolved = registry.resolveAgent(agentName);
        if (!resolved) {
          return textResult({ error: `Agent not found: ${agentName}` });
        }
        return textResult(resolved);
      }

      if (name === 'agentos_register_agent') {
        const input = z
          .object({
            suinsName: z.string(),
            runtimeWallet: z.string(),
            network: z.enum(['testnet', 'mainnet']).optional(),
          })
          .parse(args);
        const record = registry.registerAgent({
          suinsName: input.suinsName,
          runtimeWallet: input.runtimeWallet,
          network: input.network,
        });
        const config = loadConfig();
        const url = `${config.dashboardUrl ?? 'http://localhost:3000'}/agent/${record.slug}`;
        return textResult({ agent: record, dashboardUrl: url });
      }

      if (name === 'agentos_publish_skill') {
        const input = z
          .object({
            agentName: z.string(),
            manifestJson: z.string(),
            walrusBlob: z.string().optional(),
          })
          .parse(args);
        const manifest = JSON.parse(input.manifestJson) as {
          name: string;
          version: string;
          publisher: string;
          manifestType: string;
        };
        if (manifest.manifestType !== 'sui-agent-skill/v1') {
          throw new Error('manifestType must be sui-agent-skill/v1');
        }
        const record = registry.publishSkill({
          agentName: input.agentName,
          manifest: manifest as import('@agentos/sdk').SkillManifest,
          walrusManifestBlob: input.walrusBlob,
        });
        return textResult({ skill: record });
      }

      if (name === 'agentos_list_skills') {
        const { agentName } = z.object({ agentName: z.string() }).parse(args);
        return textResult({ skills: registry.listSkills(agentName) });
      }

      if (name === 'agentos_dashboard_url') {
        const { agentName } = z.object({ agentName: z.string() }).parse(args);
        const resolved = registry.resolveAgent(agentName);
        if (!resolved) {
          return textResult({ error: `Agent not found: ${agentName}` });
        }
        const config = loadConfig();
        const base = config.dashboardUrl ?? 'http://localhost:3000';
        return textResult({ url: `${base}/agent/${resolved.agent.slug}` });
      }

      return textResult({ error: `Unknown tool: ${name}` });
    } catch (e) {
      return textResult({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function textResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}
