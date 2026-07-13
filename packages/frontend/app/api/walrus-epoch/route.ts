import { DEFAULT_WALRUS_PUBLISHER } from "@agentos-sui/sdk/node";
import { NextResponse } from "next/server";

export const revalidate = 60;

/** Shape of the publisher store response (subset we rely on). */
interface WalrusStoreResponse {
  newlyCreated?: {
    blobObject?: { registeredEpoch?: number };
  };
  alreadyCertified?: {
    endEpoch?: number;
  };
}

/**
 * GET /api/walrus-epoch
 *
 * Returns the current Walrus testnet epoch number, used by the canvas WALRUS
 * tab to compute days-remaining from a blob's endEpoch.
 *
 * There is no read-only HTTP endpoint on the public aggregator/publisher that
 * reports the current epoch (it lives on Walrus's Sui system object, not
 * behind an unauthenticated HTTP route — verified against docs.wal.app). The
 * only unauthenticated way to observe it via HTTP is the store response's
 * `newlyCreated.blobObject.registeredEpoch`, so this route stores a tiny,
 * randomized 1-epoch probe blob purely to read that field back (randomized so
 * the content never collides with a prior probe and hits the
 * `alreadyCertified` path instead, which lacks `registeredEpoch` — falls back
 * to `endEpoch - 1` there since a 1-epoch blob's endEpoch is registeredEpoch+1).
 * This is a deliberate, minimal-cost workaround, not a documented API contract.
 *
 * Falls back to { epoch: 0 } on any failure so the UI degrades gracefully.
 */
export async function GET() {
  try {
    const nonce = `epoch-probe-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const res = await fetch(`${DEFAULT_WALRUS_PUBLISHER}/v1/blobs?epochs=1`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: nonce,
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json({ epoch: 0 });
    const data = (await res.json()) as WalrusStoreResponse;
    const epoch =
      data.newlyCreated?.blobObject?.registeredEpoch ??
      (data.alreadyCertified?.endEpoch !== undefined
        ? data.alreadyCertified.endEpoch - 1
        : 0);
    return NextResponse.json({ epoch });
  } catch {
    return NextResponse.json({ epoch: 0 });
  }
}
