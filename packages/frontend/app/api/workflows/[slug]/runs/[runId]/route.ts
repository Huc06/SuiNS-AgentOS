import { NextRequest, NextResponse } from 'next/server';

import { getRun } from '../../../../../../lib/runs-store';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ slug: string; runId: string }> };

/** Fetch a single run with its current steps (used for polling). */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { runId } = await context.params;
  const id = decodeURIComponent(runId).trim();
  if (!id) {
    return NextResponse.json({ error: 'runId is required' }, { status: 400 });
  }

  const run = await getRun(id);
  if (!run) {
    return NextResponse.json(
      { error: `Run not found: ${id}` },
      { status: 404 },
    );
  }

  return NextResponse.json({ run });
}
