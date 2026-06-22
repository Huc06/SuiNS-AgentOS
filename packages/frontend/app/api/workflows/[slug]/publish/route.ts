import {
  WalrusClient,
  computeWorkflowManifestHash,
  serializeWorkflowManifest,
  validateWorkflowManifest,
  type WorkflowManifest,
} from "@agentos/sdk/node";
import { NextRequest, NextResponse } from "next/server";

import { registryWorkflowToCard } from "../../../../../lib/registry-mappers";
import { getRegistryStore } from "../../../../../lib/registry-server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * POST /api/workflows/[slug]/publish
 *
 * Publish a workflow's graph: validate the `sui-agent-workflow/v1` manifest,
 * serialize it deterministically, upload the bytes to Walrus (public testnet
 * publisher — no Harbor key needed), and persist the resulting `blobId` +
 * `manifestHash` onto the workflow record (flipping it to `active`). The graph
 * is then loadable via GET /api/workflows/[slug]/graph and discoverable by the
 * workflow's SuiNS subname.
 *
 * Body: `{ manifest: WorkflowManifest }`.
 * Returns: `{ blobId, manifestHash, workflow, card }`.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const key = decodeURIComponent(slug).trim();
  if (!key) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  let body: { manifest?: WorkflowManifest };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const manifest = body.manifest;
  if (!manifest || typeof manifest !== "object") {
    return NextResponse.json(
      { error: "manifest is required" },
      { status: 400 },
    );
  }

  // Validate the workflow manifest (manifestType + graph shape) before spending
  // any Walrus storage.
  try {
    validateWorkflowManifest(manifest);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid workflow manifest" },
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

  // Serialize deterministically, hash, and upload to Walrus.
  let blobId: string;
  let manifestHash: string;
  try {
    const serialized = serializeWorkflowManifest(manifest);
    manifestHash = computeWorkflowManifestHash(serialized);
    const walrus = new WalrusClient();
    ({ blobId } = await walrus.uploadBlob(serialized));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Walrus upload failed" },
      { status: 502 },
    );
  }

  // Persist the blob + hash onto the workflow record (upsert keyed by
  // agentSlug + workflowId), flipping the draft to active.
  try {
    const updated = await registry.publishWorkflow({
      agentName: workflow.agentSlug,
      name: workflow.workflowId,
      suinsName: workflow.suinsName,
      version: manifest.version,
      walrusManifestBlob: blobId,
      manifestHash,
      status: "active",
      ...(manifest.description ? { description: manifest.description } : {}),
      ...(manifest.dependencies && manifest.dependencies.length > 0
        ? { dependencies: manifest.dependencies }
        : {}),
    });
    return NextResponse.json({
      blobId,
      manifestHash,
      workflow: updated,
      card: registryWorkflowToCard(updated, manifest.graph.nodes.length),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "persist workflow failed" },
      { status: 500 },
    );
  }
}
