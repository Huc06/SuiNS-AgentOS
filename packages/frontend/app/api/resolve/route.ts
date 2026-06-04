import { NextRequest, NextResponse } from 'next/server';

import { getRegistry } from '../../../lib/registry-server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get('name');
  if (!name) {
    return NextResponse.json({ error: 'name query parameter is required' }, { status: 400 });
  }

  try {
    const registry = getRegistry();
    const resolved = registry.resolveAgent(name);
    if (!resolved) {
      return NextResponse.json({ error: `Agent not found: ${name}` }, { status: 404 });
    }
    return NextResponse.json(resolved);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'resolve failed' },
      { status: 500 },
    );
  }
}
