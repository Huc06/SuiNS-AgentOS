import { EnokiClient } from '@mysten/enoki';
import { NextRequest, NextResponse } from 'next/server';

import { getAgentosPackageId, getSuiNetwork } from '../../../../lib/enoki-config';
import { loadRootEnv } from '../../../../lib/load-root-env';

// Load repo-root .env secrets (ENOKI_SECRET_KEY) so sponsorship works in dev.
loadRootEnv();

export const dynamic = 'force-dynamic';

function getEnokiPrivateClient(): EnokiClient | null {
  const apiKey = process.env.ENOKI_SECRET_KEY?.trim();
  if (!apiKey) return null;
  return new EnokiClient({ apiKey });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const enoki = getEnokiPrivateClient();
  if (!enoki) {
    return NextResponse.json(
      { error: 'Sponsored transactions not configured (ENOKI_SECRET_KEY)' },
      { status: 503 },
    );
  }

  if (!getAgentosPackageId()) {
    return NextResponse.json(
      { error: 'On-chain mint not configured (AGENTOS_PACKAGE_ID)' },
      { status: 503 },
    );
  }

  let body: {
    transactionBlockKindBytes?: string;
    jwt?: string;
    sender?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { transactionBlockKindBytes, jwt, sender } = body;
  if (!transactionBlockKindBytes) {
    return NextResponse.json({ error: 'transactionBlockKindBytes is required' }, { status: 400 });
  }
  if (!jwt && !sender) {
    return NextResponse.json({ error: 'jwt or sender is required' }, { status: 400 });
  }

  try {
    const sponsored = await enoki.createSponsoredTransaction(
      jwt
        ? { network: getSuiNetwork(), transactionKindBytes: transactionBlockKindBytes, jwt }
        : {
            network: getSuiNetwork(),
            transactionKindBytes: transactionBlockKindBytes,
            sender: sender!,
          },
    );
    return NextResponse.json({ bytes: sponsored.bytes, digest: sponsored.digest });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'sponsor failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
