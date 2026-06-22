import { NextRequest, NextResponse } from "next/server";

import { getRegistryStore } from "../../../../../lib/registry-server";
import { listRuns } from "../../../../../lib/runs-store";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

/** List all persisted runs for an agent (newest first). */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const key = decodeURIComponent(slug).trim();
  if (!key) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  const registry = getRegistryStore();
  let resolved = await registry.resolveAgent(key);
  // The slug may be a WORKFLOW slug — fall back to its owning agent so runs
  // (stored under the agent slug) are listed correctly.
  if (!resolved) {
    const workflow = await registry.findWorkflowBySlug(key);
    if (workflow) {
      resolved = await registry.resolveAgent(workflow.agentSlug);
    }
  }
  if (!resolved) {
    return NextResponse.json(
      { error: `Agent not found: ${key}` },
      { status: 404 },
    );
  }

  const runs = await listRuns(resolved.agent.slug);
  return NextResponse.json({ runs });
}
