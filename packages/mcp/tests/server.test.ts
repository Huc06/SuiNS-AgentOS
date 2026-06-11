import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { LocalRegistry } from '@agentos/sdk/node';

describe('MCP registry backing', () => {
  it('register + resolve matches MCP tool expectations', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentos-mcp-'));
    const path = join(dir, 'registry.json');
    const registry = new LocalRegistry(path, { version: 1, agents: [], skills: [] });

    registry.registerAgent({
      suinsName: 'mcp-agent.sui',
      runtimeWallet: '0xMCP',
    });

    const resolved = registry.resolveAgent('mcp-agent.sui');
    expect(resolved?.agent.slug).toBe('mcp-agent');
    expect(resolved?.skills).toHaveLength(0);

    rmSync(dir, { recursive: true });
  });
});
