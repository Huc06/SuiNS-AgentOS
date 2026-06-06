import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { LocalRegistry } from './local-registry.js';
import type { SkillManifest } from '../types.js';

describe('LocalRegistry', () => {
  it('resolves seed agent alpha', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentos-'));
    const path = join(dir, 'registry.json');
    const registry = new LocalRegistry(path);
    const resolved = registry.resolveAgent('alpha.sui');
    expect(resolved?.agent.slug).toBe('alpha');
    expect(resolved?.skills.length).toBeGreaterThan(0);
    rmSync(dir, { recursive: true });
  });

  it('registers agent and publishes skill', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentos-'));
    const path = join(dir, 'registry.json');
    const registry = new LocalRegistry(path, { version: 1, agents: [], skills: [] });

    registry.registerAgent({
      suinsName: 'demo.sui',
      runtimeWallet: '0x123',
    });

    const manifest: SkillManifest = {
      name: 'demo-skill',
      version: '1.0.0',
      publisher: '@demo/demo-skill',
      manifestType: 'sui-agent-skill/v1',
      mcp: { compatible: true, tools: [] },
      sui: { movePackage: '0x0', entry: 'run', policyRequired: [] },
      dependencies: [],
    };

    registry.publishSkill({ agentName: 'demo.sui', manifest });
    const skills = registry.listSkills('demo.sui');
    expect(skills).toHaveLength(1);
    expect(skills[0].skillId).toBe('demo-skill');
    rmSync(dir, { recursive: true });
  });

  it('listAgents omits revoked', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentos-'));
    const path = join(dir, 'registry.json');
    const registry = new LocalRegistry(path, {
      version: 1,
      agents: [
        {
          slug: 'live',
          suinsName: 'live.sui',
          passportId: '0x1',
          runtimeWallet: '0x1',
          network: 'testnet',
          passportVersion: 'v1',
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          slug: 'dead',
          suinsName: 'dead.sui',
          passportId: '0x2',
          runtimeWallet: '0x2',
          network: 'testnet',
          passportVersion: 'v1',
          status: 'revoked',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      skills: [],
    });
    expect(registry.listAgents()).toHaveLength(1);
    expect(registry.listAgents()[0].slug).toBe('live');
    rmSync(dir, { recursive: true });
  });

  it('removeAgent deletes agent and skills', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agentos-'));
    const path = join(dir, 'registry.json');
    const registry = new LocalRegistry(path, { version: 1, agents: [], skills: [] });

    registry.registerAgent({ suinsName: 'gone.sui', runtimeWallet: '0x1' });
    const manifest: SkillManifest = {
      name: 'skill-a',
      version: '1.0.0',
      publisher: '@gone/skill-a',
      manifestType: 'sui-agent-skill/v1',
      mcp: { compatible: true, tools: [] },
      sui: { movePackage: '0x0', entry: 'run', policyRequired: [] },
      dependencies: [],
    };
    registry.publishSkill({ agentName: 'gone.sui', manifest });

    const removed = registry.removeAgent('gone.sui');
    expect(removed.slug).toBe('gone');
    expect(registry.resolveAgent('gone.sui')).toBeNull();
    expect(registry.listSkills('gone.sui')).toHaveLength(0);

    rmSync(dir, { recursive: true });
  });
});
