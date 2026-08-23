import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

import {
  computeManifestHash,
  HarborClient,
  validateManifest,
  getWalrusUploader,
} from '@agentos-sui/sdk/node';

import { getSuiNetwork } from '../../../../lib/enoki-config';

/**
 * GET /api/skills/manifest?blobId=...&expectedHash=...
 *
 * Downloads a skill manifest from Walrus (server-side, keeps Harbor key private),
 * recomputes SHA-256, and compares to the expected on-chain hash.
 * Returns { manifest, computedHash, expectedHash, verified }.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const blobId = searchParams.get('blobId')?.trim();
  const expectedHash = searchParams.get('expectedHash')?.trim();

  if (!blobId || !expectedHash) {
    return NextResponse.json(
      { error: 'Missing blobId or expectedHash query params' },
      { status: 400 },
    );
  }

  // Don't verify placeholder blobs
  if (blobId.startsWith('walrus://') || blobId === '') {
    return NextResponse.json({
      manifest: null,
      computedHash: null,
      expectedHash,
      verified: false,
      reason: 'Manifest not uploaded to Walrus yet',
    });
  }

  try {
    // Download from Walrus (or Harbor if configured)
    let content: Uint8Array;
    const harborKey = process.env.HARBOR_API_KEY?.trim();
    if (harborKey) {
      const harbor = new HarborClient({ apiKey: harborKey });
      content = await harbor.downloadBlob(blobId);
    } else {
      const walrus = getWalrusUploader({ network: getSuiNetwork() });
      content = await walrus.downloadBlob(blobId);
    }

    // Compute SHA-256
    const computedHash = computeManifestHash(content);
    // `computeManifestHash()` emits bare hex while registry/on-chain writers
    // may prefix the same digest with `0x`; compare the canonical digest form.
    const normalizeHash = (hash: string) =>
      hash.trim().toLowerCase().replace(/^0x/, '');
    const verified = normalizeHash(computedHash) === normalizeHash(expectedHash);

    // Parse manifest
    let manifest = null;
    try {
      const text = new TextDecoder().decode(content);
      manifest = JSON.parse(text);
      validateManifest(manifest);
    } catch {
      // Invalid JSON or schema — still return hash comparison
      manifest = null;
    }

    return NextResponse.json({
      manifest,
      computedHash,
      expectedHash,
      verified,
    });
  } catch (err) {
    return NextResponse.json({
      manifest: null,
      computedHash: null,
      expectedHash,
      verified: false,
      reason: err instanceof Error ? err.message : 'Download failed',
    });
  }
}
