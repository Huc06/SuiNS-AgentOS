import { NextRequest, NextResponse } from 'next/server';
import type { SkillManifest } from '@agentos/sdk';

import { getRegistry } from '../../../lib/registry-server';
import { registrySkillToRow } from '../../../lib/registry-mappers';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: {
    agentName?: string;
    skillId?: string;
    mvrPackage?: string;
    version?: string;
    walrusManifestBlob?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { agentName, skillId, mvrPackage, version, walrusManifestBlob } = body;
  if (!agentName?.trim() || !skillId?.trim() || !mvrPackage?.trim() || !version?.trim()) {
    return NextResponse.json(
      { error: 'agentName, skillId, mvrPackage, and version are required' },
      { status: 400 },
    );
  }

  const versionNorm = version.trim().replace(/^v/i, '');
  const manifest: SkillManifest = {
    name: skillId.trim(),
    version: versionNorm,
    publisher: mvrPackage.trim().startsWith('@')
      ? mvrPackage.trim()
      : `@${mvrPackage.trim()}`,
    manifestType: 'sui-agent-skill/v1',
    mcp: { compatible: true, tools: [] },
    sui: {
      movePackage: '0x0',
      entry: skillId.trim(),
      policyRequired: [],
    },
    dependencies: [],
  };

  try {
    const registry = getRegistry();
    const skill = registry.publishSkill({
      agentName: agentName.trim(),
      manifest,
      walrusManifestBlob: walrusManifestBlob?.trim(),
    });
    return NextResponse.json({ skill: registrySkillToRow(skill) });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'publish failed';
    const status = message.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
