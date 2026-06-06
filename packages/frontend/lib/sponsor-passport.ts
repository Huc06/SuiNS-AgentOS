'use client';

import { getSession, isEnokiWallet } from '@mysten/enoki';
import { buildCreatePassportTx } from './passport-tx';

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export async function sponsorCreatePassport(options: {
  suiClient: unknown;
  packageId: string;
  suinsName: string;
  runtimeWallet: string;
  wallet: Parameters<typeof isEnokiWallet>[0] | null;
  signTransaction: (input: { transaction: string }) => Promise<{ signature: string }>;
}): Promise<{ digest: string }> {
  const tx = buildCreatePassportTx({
    packageId: options.packageId,
    suinsName: options.suinsName,
    runtimeWallet: options.runtimeWallet,
    recipient: options.runtimeWallet,
  });

  const transactionBlockKindBytes = await tx.build({
    client: options.suiClient as never,
    onlyTransactionKind: true,
  });

  const kindBase64 = uint8ArrayToBase64(transactionBlockKindBytes);

  let jwt: string | undefined;
  if (options.wallet && isEnokiWallet(options.wallet)) {
    const session = await getSession(options.wallet);
    jwt = session?.jwt;
  }

  const sponsorRes = await fetch('/api/transaction/sponsor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      jwt
        ? { transactionBlockKindBytes: kindBase64, jwt }
        : {
            transactionBlockKindBytes: kindBase64,
            sender: options.runtimeWallet,
          },
    ),
  });

  if (!sponsorRes.ok) {
    const err = (await sponsorRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Sponsor failed (${sponsorRes.status})`);
  }

  const { bytes, digest } = (await sponsorRes.json()) as { bytes: string; digest: string };
  const { signature } = await options.signTransaction({ transaction: bytes });

  const execRes = await fetch('/api/transaction/execute-sponsored', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ digest, signature }),
  });

  if (!execRes.ok) {
    const err = (await execRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Execute failed (${execRes.status})`);
  }

  const result = (await execRes.json()) as { digest: string };
  return result;
}
