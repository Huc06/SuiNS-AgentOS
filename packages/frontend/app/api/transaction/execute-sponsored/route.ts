import { EnokiClient } from '@mysten/enoki';
import { NextRequest, NextResponse } from 'next/server';

import { loadRootEnv } from '../../../../lib/load-root-env';

// Load repo-root .env secrets (ENOKI_SECRET_KEY) so sponsorship works in dev.
loadRootEnv();

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.ENOKI_SECRET_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Sponsored transactions not configured (ENOKI_SECRET_KEY)' },
      { status: 503 },
    );
  }

  let body: { digest?: string; signature?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { digest, signature } = body;
  if (!digest || !signature) {
    return NextResponse.json({ error: 'digest and signature are required' }, { status: 400 });
  }

  try {
    const enoki = new EnokiClient({ apiKey });
    const result = await enoki.executeSponsoredTransaction({ digest, signature });
    return NextResponse.json({ digest: result.digest });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'execute failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
