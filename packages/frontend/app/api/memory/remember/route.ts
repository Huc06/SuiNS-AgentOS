import { NextRequest, NextResponse } from 'next/server';

import { memwalFromEnv } from '@agentos-sui/sdk/node';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { agentSlug?: string; text?: string };
  try {
    body = (await request.json()) as { agentSlug?: string; text?: string };
  } catch {
    return NextResponse.json({ ok: false, reason: 'Invalid JSON' }, { status: 400 });
  }

  const { agentSlug, text } = body;
  if (!agentSlug || !text) {
    return NextResponse.json({ ok: false, reason: 'Missing agentSlug or text' }, { status: 400 });
  }

  const memwal = memwalFromEnv();
  if (!memwal) {
    return NextResponse.json({ ok: false, reason: 'Walrus Memory not configured' });
  }

  try {
    await memwal.remember(`agentos:${agentSlug}`, text);
    return NextResponse.json({ ok: true });
  } catch (e) {
    // Always 200 — callers fire-and-forget, a 5xx would log noise
    return NextResponse.json({ ok: false, reason: e instanceof Error ? e.message : 'Remember failed' });
  }
}
