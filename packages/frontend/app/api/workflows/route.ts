import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { registryWorkflowToCard } from "../../../lib/registry-mappers";
import { getRegistryStore } from "../../../lib/registry-server";

export const dynamic = "force-dynamic";

/**
 * GET /api/workflows
 * List all published/draft workflows (across agents) as cards for the
 * Workflows page. A workflow is "many skills composed into one", published
 * under an agent as its own SuiNS subname; its DAG lives on Walrus.
 *
 * Optional `?agent=<suins|slug>` filters to one agent's workflows.
 */
export async function GET(request: NextRequest) {
  try {
    const registry = getRegistryStore();
    const agentFilter = request.nextUrl.searchParams.get("agent")?.trim();
    const workflows = agentFilter
      ? await registry.listWorkflows(agentFilter)
      : await registry.getWorkflows();
    return NextResponse.json({
      workflows: workflows.map((w) => registryWorkflowToCard(w)),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "list workflows failed" },
      { status: 500 },
    );
  }
}

const createWorkflowSchema = z.object({
  agentName: z.string().trim().min(1, "agentName is required"),
  name: z.string().trim().min(1, "name is required"),
  suinsName: z.string().trim().min(1, "suinsName is required"),
  description: z.string().trim().optional(),
});

/**
 * POST /api/workflows
 * Create a workflow record (a draft) under an existing agent after its SuiNS
 * subname has been minted (see POST /api/subname). The graph itself is added
 * later by the canvas via POST /api/workflows/[slug]/publish. Returns the
 * created record (incl. its `slug`, the canvas route key).
 */
export async function POST(request: NextRequest) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createWorkflowSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }
  const { agentName, name, suinsName, description } = parsed.data;

  const registry = getRegistryStore();
  if (!(await registry.findAgentBySuins(agentName)) &&
      !(await registry.resolveAgent(agentName))) {
    return NextResponse.json(
      { error: `Agent not found: ${agentName}` },
      { status: 404 },
    );
  }

  try {
    const workflow = await registry.publishWorkflow({
      agentName,
      name,
      suinsName,
      status: "draft",
      ...(description ? { description } : {}),
    });
    return NextResponse.json({
      workflow,
      card: registryWorkflowToCard(workflow),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "create workflow failed";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
