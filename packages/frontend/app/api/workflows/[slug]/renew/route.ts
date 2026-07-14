import {
  DEFAULT_WALRUS_AGGREGATOR,
  WalrusClient,
} from "@agentos-sui/sdk/node";
import { NextRequest, NextResponse } from "next/server";

import { getRegistryStore } from "../../../../../lib/registry-server";

export const dynamic = "force-dynamic";

const ALLOWED_EPOCHS = new Set([13, 26, 53, 183]);

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * POST /api/workflows/[slug]/renew
 * Re-uploads the existing manifest bytes with a new epoch count to extend
 * Walrus storage. Walrus deduplicates by content: same bytes = same blobId,
 * but endEpoch is extended. Updates the registry record with the new endEpoch.
 *
 * Body: { epochs: 13 | 26 | 53 | 183 }
 * Returns: { ok: true, blobId: string, endEpoch: number }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const key = decodeURIComponent(slug).trim();

  let body: { epochs?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const epochs = Number(body.epochs);
  if (!ALLOWED_EPOCHS.has(epochs)) {
    return NextResponse.json(
      { error: "epochs must be 13, 26, 53, or 183" },
      { status: 400 },
    );
  }

  const registry = getRegistryStore();
  const workflow = await registry.findWorkflowBySlug(key);
  if (!workflow) {
    return NextResponse.json(
      { error: `Workflow not found: ${key}` },
      { status: 404 },
    );
  }

  if (!workflow.walrusManifestBlob) {
    return NextResponse.json(
      { error: "workflow has not been published — publish via MCP first" },
      { status: 422 },
    );
  }

  const walrus = new WalrusClient({ aggregatorUrl: DEFAULT_WALRUS_AGGREGATOR });

  // Download existing manifest bytes.
  let bytes: Uint8Array;
  try {
    bytes = await walrus.downloadBlob(workflow.walrusManifestBlob);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("not found")) {
      return NextResponse.json(
        { error: "blob expired — re-publish required via MCP" },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: `Walrus unavailable: ${msg}` },
      { status: 502 },
    );
  }

  // Re-upload with new epoch count. Same content = same blobId, endEpoch extended.
  let blobId: string;
  let endEpoch: number | undefined;
  try {
    ({ blobId, endEpoch } = await walrus.uploadBlob(bytes, { epochs }));
  } catch (e) {
    return NextResponse.json(
      { error: `Walrus unavailable: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }

  // Persist updated endEpoch.
  await registry.publishWorkflow({
    agentName: workflow.agentSlug,
    name: workflow.workflowId,
    suinsName: workflow.suinsName,
    version: workflow.version,
    walrusManifestBlob: blobId,
    manifestHash: workflow.manifestHash,
    endEpoch,
    status: "active",
    ...(workflow.description ? { description: workflow.description } : {}),
    ...(workflow.dependencies && workflow.dependencies.length > 0
      ? { dependencies: workflow.dependencies }
      : {}),
  });

  return NextResponse.json({ ok: true, blobId, endEpoch: endEpoch ?? null });
}
