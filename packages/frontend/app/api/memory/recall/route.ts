import { NextRequest, NextResponse } from 'next/server';

import { memwalFromEnv } from '@agentos-sui/sdk/node';

export const dynamic = 'force-dynamic';

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
    return NextResponse.json({ memories: result, configured: true });
  } catch (e) {
    return NextResponse.json({
      memories: [],
      configured: true,
      error: e instanceof Error ? e.message : 'Recall failed',
    });
  }
}
