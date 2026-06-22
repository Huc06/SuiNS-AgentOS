import {
  WalrusClient,
  computeWorkflowManifestHash,
  validateWorkflowManifest,
  type WorkflowManifest,
} from "@agentos/sdk/node";
import { NextRequest, NextResponse } from "next/server";

import { getRegistryStore } from "../../../../../lib/registry-server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * GET /api/workflows/[slug]/graph
 *
 * Load a published workflow's graph by downloading its manifest blob from
 * Walrus and verifying its SHA-256 against the stored hash. Returns the parsed
 * graph + full manifest so the canvas can hydrate the editor. Responds 404 when
 * the workflow has no published blob yet (still a draft) and 502 when the blob
 * is unreadable or tampered.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const key = decodeURIComponent(slug).trim();
  if (!key) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
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
      { error: "Workflow has no published graph yet", draft: true },
      { status: 404 },
    );
  }

  try {
    const walrus = new WalrusClient();
    const bytes = await walrus.downloadBlob(workflow.walrusManifestBlob);

    // Verify integrity against the stored hash (when present).
    if (workflow.manifestHash) {
      const actual = computeWorkflowManifestHash(bytes);
      if (actual !== workflow.manifestHash) {
        return NextResponse.json(
          { error: "Workflow manifest hash mismatch (blob tampered)" },
          { status: 502 },
        );
      }
    }

    const manifest = JSON.parse(
      new TextDecoder().decode(bytes),
    ) as WorkflowManifest;
    validateWorkflowManifest(manifest);

    return NextResponse.json({
      graph: manifest.graph,
      manifest,
      workflow,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "load graph failed" },
      { status: 502 },
    );
  }
}
