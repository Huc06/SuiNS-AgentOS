import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Check whether a skill's Walrus manifest blob is reachable.
 *
 * Checks the public Walrus aggregator first (no API key needed).
 * Falls back to Harbor gateway if HARBOR_API_KEY is configured.
 *
 * Usage: GET /api/skills/blob-status?blobId=...
 * Returns: { available: boolean }
 */

const WALRUS_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";
const HARBOR_BASE_URL = "https://api.testnet.harbor.walrus.xyz";

export async function GET(request: NextRequest) {
  const blobId = request.nextUrl.searchParams.get("blobId")?.trim();
  if (!blobId) {
    return NextResponse.json(
      { error: "blobId query parameter is required" },
      { status: 400 },
    );
  }

  // 1. Try public Walrus aggregator (no auth needed)
  try {
    const walrusUrl = `${WALRUS_AGGREGATOR}/v1/blobs/${encodeURIComponent(blobId)}`;
    const res = await fetch(walrusUrl, { method: "HEAD" });
    if (res.ok) {
      return NextResponse.json({ available: true });
    }
    // If HEAD not supported, try GET
    if (res.status === 405 || res.status === 501) {
      const getRes = await fetch(walrusUrl, { method: "GET" });
      if (getRes.ok) {
        return NextResponse.json({ available: true });
      }
    }
  } catch {
    // Walrus unreachable — try Harbor below
  }

  // 2. Fallback: try Harbor gateway if API key is available
  const harborKey = process.env.HARBOR_API_KEY?.trim();
  if (harborKey) {
    try {
      const harborUrl = `${process.env.HARBOR_BASE_URL?.trim() || HARBOR_BASE_URL}/api/v1/blobs/${encodeURIComponent(blobId)}`;
      const res = await fetch(harborUrl, {
        method: "HEAD",
        headers: { Authorization: `Bearer ${harborKey}` },
      });
      if (res.ok) {
        return NextResponse.json({ available: true });
      }
    } catch {
      // Harbor also unreachable
    }
  }

  return NextResponse.json({ available: false });
}
