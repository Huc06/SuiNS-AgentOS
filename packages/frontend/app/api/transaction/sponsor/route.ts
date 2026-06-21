import { EnokiClient } from '@mysten/enoki';
import { NextRequest, NextResponse } from 'next/server';

import {
  getAgentosPackageId,
  getAllowedMoveCallTargets,
  getSuiNetwork,
} from '../../../../lib/enoki-config';
import { loadRootEnv } from '../../../../lib/load-root-env';

// Load repo-root .env secrets (ENOKI_SECRET_KEY) so sponsorship works in dev.
loadRootEnv();

export const dynamic = 'force-dynamic';

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

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
    // For the `sender` branch, scope the sponsorship at call time with
    // `allowedAddresses` + `allowedMoveCallTargets` so no Enoki *portal*
    // allowlist is needed (else Enoki returns SPONSOR_REJECTED). These options
    // are only valid in the `sender` variant — the `jwt` variant forbids them.
    const sponsored = await enoki.createSponsoredTransaction(
      jwt
        ? { network: getSuiNetwork(), transactionKindBytes: transactionBlockKindBytes, jwt }
        : {
            network: getSuiNetwork(),
            transactionKindBytes: transactionBlockKindBytes,
            sender: sender!,
            allowedAddresses: [sender!],
            allowedMoveCallTargets: getAllowedMoveCallTargets(),
          },
    );
    return NextResponse.json({ bytes: sponsored.bytes, digest: sponsored.digest });
  } catch (e) {
    // Surface Enoki's server-side reason (`.errors` / `.cause` / `.status`),
    // which pinpoints *why* the sponsor was rejected far better than `.message`.
    const err = e as
      | { message?: string; errors?: unknown; cause?: unknown; status?: unknown }
      | undefined;
    const base = err?.message ?? 'sponsor failed';
    const detailParts: string[] = [];
    if (err?.errors !== undefined) detailParts.push(`errors=${safeJson(err.errors)}`);
    if (err?.cause !== undefined) detailParts.push(`cause=${safeJson(err.cause)}`);
    if (err?.status !== undefined) detailParts.push(`status=${String(err.status)}`);
    const message = detailParts.length ? `${base} — ${detailParts.join(' ')}` : base;
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
