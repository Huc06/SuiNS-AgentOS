import { NextRequest, NextResponse } from "next/server";
import type { SkillManifest } from "@agentos/sdk/node";

import { getRegistryStore } from "../../../../lib/registry-server";
import { registrySkillToRow } from "../../../../lib/registry-mappers";

export const dynamic = "force-dynamic";

/**
 * Import a Sui Agent Skill from the catalog into an agent's registry.
 *
 * SIMPLIFICATION: the full Sui Agent Skills import pipeline downloads a
 * `SKILL.md` (e.g. via `npx skills add ...`), parses its frontmatter, and
 * converts it to a `sui-agent-skill/v1` manifest. Running `npx` inside a
 * Next.js request handler is not appropriate (slow, sandbox/network concerns),
 * so this route instead constructs a MINIMAL instruction-only manifest for the
 * named catalog skill — empty `movePackage`/`entry`, no MCP tools. The skill is
 * recorded with `source: 'sui-skills'`. For Move-backed execution, re-publish
 * via the CLI `skill import` pipeline which performs the full conversion.
 *
 * SECURITY NOTE: this route is UNAUTHENTICATED — any caller who can reach it
 * can add registry entries to any agent. It performs no on-chain mutation and
 * spends no Harbor quota (no Walrus upload here), so blast radius is limited to
 * the local registry file. Add a session/signature check before public
 * exposure.
 */
export async function POST(request: NextRequest) {
  let body: {
    agentName?: string;
    skillId?: string;
    name?: string;
    description?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { agentName, skillId } = body;
  if (!agentName?.trim() || !skillId?.trim()) {
    return NextResponse.json(
      { error: "agentName and skillId are required" },
      { status: 400 },
    );
  }

  // Minimal instruction-only manifest for the imported catalog skill.
  const manifest: SkillManifest = {
    name: skillId.trim(),
    version: "1.0.0",
    publisher: `@${agentName.trim().replace(/\.sui$/i, "")}`,
    manifestType: "sui-agent-skill/v1",
    mcp: { compatible: true, tools: [] },
    sui: {
      movePackage: "",
      entry: "",
      policyRequired: [],
    },
    dependencies: [],
  };

  try {
    const registry = getRegistryStore();
    const skill = await registry.publishSkill({
      agentName: agentName.trim(),
      manifest,
      source: "sui-skills",
    });
    return NextResponse.json({ skill: registrySkillToRow(skill) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "import failed";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
