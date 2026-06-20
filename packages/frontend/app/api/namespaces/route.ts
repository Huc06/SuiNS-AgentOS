import { NextRequest, NextResponse } from 'next/server';

import { getRegistry } from '../../../lib/registry-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/namespaces?agent=<name>
 *
 * Returns the Walrus-memory namespaces the canvas can offer in the memory-node
 * namespace picker for an agent. Memwal has NO list-namespaces endpoint, so the
 * list is derived entirely from the local registry: the agent's `.sui` name is
 * always the default (first), followed by any namespaces previously written to
 * by `memory` (remember) runs. The response is deduped, default-first.
 */
export async function GET(request: NextRequest) {
  const agent = request.nextUrl.searchParams.get('agent')?.trim();
  if (!agent) {
    return NextResponse.json(
      { error: 'agent query parameter is required' },
      { status: 400 },
    );
  }

  try {
    const registry = getRegistry();
    const resolved = registry.resolveAgent(agent);
    if (!resolved) {
      return NextResponse.json(
        { error: `Agent not found: ${agent}` },
        { status: 404 },
      );
    }

    const defaultNs = resolved.agent.suinsName;
    const recorded = registry.listMemoryNamespaces(agent);
    // Default (the .sui name) first, then the rest, deduped.
    const namespaces = [
      defaultNs,
      ...recorded.filter((n) => n !== defaultNs),
    ];

    return NextResponse.json({ default: defaultNs, namespaces });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to list namespaces' },
      { status: 500 },
    );
  }
}
