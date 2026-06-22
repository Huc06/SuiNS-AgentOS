import { NextRequest, NextResponse } from "next/server";

import { getRegistryStore } from "../../../../../lib/registry-server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

/**
 * GET /api/agents/[slug]/skills
 * List skills belonging to an agent. Returns the raw RegistrySkillRecord array
 * so the canvas Tools palette can render a "My Skills" section with SuiNS names.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const key = decodeURIComponent(slug).trim();
  if (!key) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  try {
    const registry = getRegistryStore();
    const skills = await registry.listSkills(key);
    return NextResponse.json({ skills });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "list skills failed" },
      { status: 500 },
    );
  }
}
