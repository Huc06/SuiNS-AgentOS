import { contracts } from '@agentos/sdk/node';
import { Transaction } from '@mysten/sui/transactions';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getAgentosPackageId } from '../../../lib/enoki-config';
import { registryAgentToCard } from '../../../lib/registry-mappers';
import { getRegistry } from '../../../lib/registry-server';
import {
  getRuntimeAddress,
  sponsoredExecuteServer,
} from '../../../lib/sponsored-execute';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const registry = getRegistry();
    const agents = registry.listAgents().map((agent) => {
      const skills = registry.listSkills(agent.suinsName);
      return registryAgentToCard(agent, skills.length);
    });
    return NextResponse.json({ agents });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'list agents failed' },
      { status: 500 },
    );
  }
}

const createAgentSchema = z.object({
  suinsName: z.string().trim().min(1, 'suinsName is required'),
  runtimeWallet: z.string().trim().min(1, 'runtimeWallet is required'),
  network: z.enum(['mainnet', 'testnet']).optional(),
  description: z.string().trim().optional(),
});

/**
 * Mint an AgentPassport gasless (Enoki-sponsored, server-side keypair) and
 * persist it to the local registry. Falls back to a registry-only record when
 * on-chain minting is unavailable (no packageId / no sponsor env / RPC error),
 * so dev mode keeps working without gas.
 */
export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = createAgentSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request body' },
      { status: 400 },
    );
  }
  const { suinsName, runtimeWallet, network, description } = parsed.data;

  const registry = getRegistry();

  // Reject duplicates before doing any on-chain work.
  if (registry.findAgentBySuins(suinsName)) {
    return NextResponse.json(
      { error: `Agent already registered: ${suinsName}` },
      { status: 409 },
    );
  }

  // Best-effort gasless on-chain mint. Any failure falls through to registry-only.
  let passportId: string | undefined;
  let digest: string | undefined;
  const packageId = getAgentosPackageId();
  if (packageId) {
    try {
      const runtimeAddress = getRuntimeAddress();
      const tx = new Transaction();
      const passport = tx.add(
        contracts.agentPassport.create({
          suinsName,
          runtimeWallet,
          packageId,
        }),
      );
      tx.transferObjects([passport], runtimeAddress);

      const result = await sponsoredExecuteServer(tx);
      digest = result.digest;
      const created = result.objectChanges?.find(
        (c) =>
          c.type === 'created' &&
          c.objectType?.includes('agent_passport::AgentPassport'),
      );
      if (created) passportId = created.objectId;
    } catch (e) {
      // Sponsor/exec unavailable or failed — fall back to registry-only behavior.
      console.warn(
        '[api/agents] gasless mint failed, falling back to registry-only:',
        e instanceof Error ? e.message : e,
      );
    }
  }

  try {
    const agent = registry.registerAgent({
      suinsName,
      runtimeWallet,
      network: network ?? 'testnet',
      description,
      passportId,
    });
    const skills = registry.listSkills(agent.suinsName);
    return NextResponse.json({
      agent,
      card: registryAgentToCard(agent, skills.length),
      onChain: Boolean(passportId),
      ...(digest ? { digest } : {}),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'register failed';
    const status = message.includes('already registered') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
