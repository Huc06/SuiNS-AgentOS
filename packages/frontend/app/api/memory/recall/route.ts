import { NextRequest, NextResponse } from 'next/server';

import { memwalFromEnv } from '@agentos-sui/sdk/node';

export const dynamic = 'force-dynamic';

/**
 * The memwal relayer's `recall` response shape isn't guaranteed to be a bare
 * array — it may wrap hits under `results`/`memories`/`matches`. Normalize to
 * a plain array so the client never has to guess the shape.
 */
function normalizeMemories(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const rec = raw as Record<string, unknown>;
    const arr = rec.results ?? rec.memories ?? rec.matches;
    if (Array.isArray(arr)) return arr;
  }
  return [];
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const agent = searchParams.get('agent')?.trim();
  const query = searchParams.get('query')?.trim() || 'agent activity execution';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '10', 10), 50);

  if (!agent) {
    return NextResponse.json({ memories: [], configured: false, error: 'Missing agent param' }, { status: 400 });
  }

  const memwal = memwalFromEnv();
  if (!memwal) {
    return NextResponse.json({ memories: [], configured: false });
  }

  try {
    const result = await memwal.recall(`agentos:${agent}`, query, limit);
    return NextResponse.json({ memories: normalizeMemories(result), configured: true });
  } catch (e) {
    return NextResponse.json({
      memories: [],
      configured: true,
      error: e instanceof Error ? e.message : 'Recall failed',
    });
  }
}
