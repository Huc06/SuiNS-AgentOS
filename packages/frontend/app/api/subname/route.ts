import { NextResponse } from 'next/server';

/**
 * POST /api/subname
 * Mints a SuiNS subname for an agent using the Enoki Identity Subnames API.
 * Body: { name: string, targetAddress: string }
 * Returns: { suinsName: string, success: true }
 *
 * Requires ENOKI_SECRET_KEY env. Returns 503 if not configured.
 */
export async function POST(request: Request) {
  const enokiKey = process.env.ENOKI_SECRET_KEY?.trim();
  if (!enokiKey) {
    return NextResponse.json(
      { error: 'Enoki not configured — subname minting unavailable.' },
      { status: 503 },
    );
  }

  const body = (await request.json()) as {
    name?: string;
    targetAddress?: string;
  };

  const { name, targetAddress } = body;
  if (!name || !targetAddress) {
    return NextResponse.json(
      { error: 'Missing required fields: name, targetAddress' },
      { status: 400 },
    );
  }

  // Normalize: strip .sui suffix if provided, we'll append our app domain
  const cleanName = name
    .trim()
    .toLowerCase()
    .replace(/\.sui$/, '')
    .replace(/^@/, '');

  if (!cleanName || cleanName.includes('.')) {
    return NextResponse.json(
      { error: 'Invalid name — must be a simple label (e.g., "my-agent")' },
      { status: 400 },
    );
  }

  const network = process.env.NEXT_PUBLIC_SUI_NETWORK?.trim() || 'testnet';

  try {
    // Use Enoki Identity Subnames API to create a subname
    // Format: {name}.{appDomain}.sui
    const enokiRes = await fetch('https://api.enoki.mystenlabs.com/v1/subnames', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${enokiKey}`,
      },
      body: JSON.stringify({
        name: cleanName,
        targetAddress,
        network,
      }),
    });

    if (!enokiRes.ok) {
      const errData = (await enokiRes.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      const message =
        errData.error || errData.message || `Enoki subname creation failed (${enokiRes.status})`;

      // If name is taken, return a clear message
      if (enokiRes.status === 409 || message.toLowerCase().includes('taken')) {
        return NextResponse.json(
          { error: `Name "${cleanName}" is already taken.` },
          { status: 409 },
        );
      }

      return NextResponse.json({ error: message }, { status: enokiRes.status });
    }

    const result = (await enokiRes.json()) as {
      suinsName?: string;
      name?: string;
    };

    const resolvedName = result.suinsName || `${cleanName}.sui`;

    return NextResponse.json({
      suinsName: resolvedName,
      success: true,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Subname creation failed unexpectedly',
      },
      { status: 500 },
    );
  }
}
