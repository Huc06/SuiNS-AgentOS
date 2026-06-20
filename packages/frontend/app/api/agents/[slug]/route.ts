import { NextRequest, NextResponse } from 'next/server';

import { getRegistryStore } from '../../../../lib/registry-server';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ slug: string }> };

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const key = decodeURIComponent(slug).trim();
  if (!key) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  }

  try {
    const registry = getRegistryStore();
    const removed = await registry.removeAgent(key);
    return NextResponse.json({
      removed: {
        slug: removed.slug,
        suinsName: removed.suinsName,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'delete failed';
    const status = message.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
