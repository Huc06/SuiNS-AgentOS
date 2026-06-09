import { NextRequest, NextResponse } from "next/server";
import { HarborClient } from "@agentos/sdk/node";

export const dynamic = "force-dynamic";

/**
 * Default Harbor gateway base URL. Mirrors the SDK's HarborClient default
 * (testnet gateway) and can be overridden with HARBOR_BASE_URL.
 */
const DEFAULT_BASE_URL = "https://api.testnet.harbor.walrus.xyz";

function harborBaseUrl(): string {
  return (process.env.HARBOR_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(
    /\/+$/,
    "",
  );
}

/**
 * Check whether a skill's Walrus manifest blob is reachable.
 *
 * The browser cannot perform this check directly: the Walruscan explorer link
 * points to an HTML page (not the blob itself, so a HEAD there is meaningless),
 * and a direct cross-origin fetch to the Harbor/Walrus aggregator would both
 * leak the server-only Harbor API key and likely hit CORS. So the frontend
 * calls this route, which performs the reachability check server-side against
 * the same `/api/v1/blobs/{blobId}` endpoint the SDK's `HarborClient.downloadBlob`
 * uses, and returns `{ available: boolean }`.
 *
 * Semantics: a 2xx response means the blob is reachable (`available: true`);
 * a 404 or any network/transport error means it is not (`available: false`).
 *
 * We issue a HEAD request to avoid downloading the blob body, and fall back to
 * a GET if the gateway does not support HEAD (405/501).
 *
 * SECURITY NOTE: this route is UNAUTHENTICATED, consistent with the sibling
 * upload route. It only reveals a single boolean (blob reachable or not) for a
 * caller-supplied blobId and never returns blob contents, so its disclosure
 * surface is minimal. The Harbor API key stays server-side. Add auth before
 * exposing publicly if blob-existence probing becomes a concern.
 *
 * Usage: GET /api/skills/blob-status?blobId=...
 */
export async function GET(request: NextRequest) {
  const blobId = request.nextUrl.searchParams.get("blobId")?.trim();
  if (!blobId) {
    return NextResponse.json(
      { error: "blobId query parameter is required" },
      { status: 400 },
    );
  }

  let apiKey: string;
  try {
    apiKey = HarborClient.getApiKey();
  } catch {
    return NextResponse.json(
      {
        error:
          "Harbor API key not configured. Set HARBOR_API_KEY or add harborApiKey to .agentos/config.json",
      },
      { status: 503 },
    );
  }

  const url = `${harborBaseUrl()}/api/v1/blobs/${encodeURIComponent(blobId)}`;
  const headers = { Authorization: `Bearer ${apiKey}` };

  try {
    let response = await fetch(url, { method: "HEAD", headers });
    // Some gateways reject HEAD — retry with GET so we still get a real answer.
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, { method: "GET", headers });
    }
    return NextResponse.json({ available: response.ok });
  } catch {
    // Network/transport failure: treat the blob as unreachable.
    return NextResponse.json({ available: false });
  }
}
