import { NextRequest, NextResponse } from 'next/server';

import { getRegistryStore } from '../../../../../lib/registry-server';
import { listRuns } from '../../../../../lib/runs-store';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ slug: string }> };

/** List all persisted runs for an agent (newest first). */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const key = decodeURIComponent(slug).trim();
  if (!key) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  }

  const registry = getRegistryStore();
  const resolved = await registry.resolveAgent(key);
  if (!resolved) {
    return NextResponse.json(
      { error: `Agent not found: ${key}` },
      { status: 404 },
    );
  }

  const runs = await listRuns(resolved.agent.slug);
  return NextResponse.json({ runs });
}
