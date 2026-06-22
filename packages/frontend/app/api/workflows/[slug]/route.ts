import { NextRequest, NextResponse } from "next/server";

import { registryWorkflowToCard } from "../../../../lib/registry-mappers";
import { getRegistryStore } from "../../../../lib/registry-server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * GET /api/workflows/[slug]
 * Fetch a single workflow record by its canvas slug. Returns 404 when the slug
 * does not match a known workflow.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const key = decodeURIComponent(slug).trim();
  if (!key) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  try {
    const registry = getRegistryStore();
    const workflow = await registry.findWorkflowBySlug(key);
    if (!workflow) {
      return NextResponse.json(
        { error: `Workflow not found: ${key}` },
        { status: 404 },
      );
    }
    return NextResponse.json({
      workflow,
      card: registryWorkflowToCard(workflow),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "get workflow failed" },
      { status: 500 },
    );
  }
}
