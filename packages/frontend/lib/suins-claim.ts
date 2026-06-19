'use client';

/**
 * Client-side helper to claim a SuiNS name via the `/api/subname` server route.
 * Returns the claimed `.sui` name on success.
 */
export async function claimSuinsName(options: {
  name: string;
  targetAddress: string;
}): Promise<{ suinsName: string }> {
  const res = await fetch('/api/subname', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: options.name,
      targetAddress: options.targetAddress,
    }),
  });

  const data = (await res.json()) as {
    suinsName?: string;
    error?: string;
    success?: boolean;
  };

  if (!res.ok || !data.suinsName) {
    throw new Error(data.error ?? `Name claim failed (${res.status})`);
  }

  return { suinsName: data.suinsName };
}

/**
 * Check if a SuiNS name is available by calling getNameRecord.
 * Returns true if the name is NOT registered (available to claim).
 */
export async function checkSuinsAvailability(options: {
  client: unknown;
  network: 'testnet' | 'mainnet' | 'devnet';
  name: string;
}): Promise<'available' | 'taken' | 'error'> {
  try {
    // Import dynamically to keep this file browser-safe
    const { createSuinsClient, normalizeSuinsInput } = await import('./suins-helpers');
    const normalized = normalizeSuinsInput(options.name);
    const suins = createSuinsClient(options.client as never, options.network);
    const record = await suins.getNameRecord(normalized);
    return record ? 'taken' : 'available';
  } catch {
    return 'error';
  }
}
