import { NextRequest, NextResponse } from "next/server";
import { validateManifest, type SkillManifest } from "@agentos/sdk";

import { getRegistry } from "../../../lib/registry-server";
import { registrySkillToRow } from "../../../lib/registry-mappers";

export const dynamic = "force-dynamic";

type SkillSource = "custom" | "sui-skills" | "suiperpower";

/**
 * Publish a skill into an agent's registry.
 *
 * Accepts two body shapes:
 *  1. Field shape — `{ agentName, skillId, mvrPackage, version, walrusManifestBlob? }`
 *     (used by the in-app publish flow); a minimal manifest is assembled.
 *  2. Manifest shape — `{ agentName, manifest, source? }` where `manifest` is a
 *     full `sui-agent-skill/v1` manifest (used by the "Upload Manifest" import
 *     tab). The manifest is validated before publishing.
 *
 * SECURITY NOTE: this route is UNAUTHENTICATED. It mutates only the local
 * registry file (no on-chain tx, no Harbor upload). Add an auth/signature
 * check before exposing publicly.
 */
export async function POST(request: NextRequest) {
  let body: {
    agentName?: string;
    skillId?: string;
    mvrPackage?: string;
    version?: string;
    walrusManifestBlob?: string;
    manifest?: SkillManifest;
    source?: SkillSource;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { agentName, walrusManifestBlob } = body;
  if (!agentName?.trim()) {
    return NextResponse.json(
      { error: "agentName is required" },
      { status: 400 },
    );
  }

  let manifest: SkillManifest;
  const source: SkillSource = body.source ?? "custom";

  if (body.manifest && typeof body.manifest === "object") {
    // Manifest-shape (uploaded manifest file): validate before persisting.
    try {
      validateManifest(body.manifest);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Invalid manifest" },
        { status: 400 },
      );
    }
    manifest = body.manifest;
  } else {
    // Field-shape: assemble a minimal manifest from individual fields.
    const { skillId, mvrPackage, version } = body;
    if (!skillId?.trim() || !mvrPackage?.trim() || !version?.trim()) {
      return NextResponse.json(
        { error: "agentName, skillId, mvrPackage, and version are required" },
        { status: 400 },
      );
    }
    const versionNorm = version.trim().replace(/^v/i, "");
    manifest = {
      name: skillId.trim(),
      version: versionNorm,
      publisher: mvrPackage.trim().startsWith("@")
        ? mvrPackage.trim()
        : `@${mvrPackage.trim()}`,
      manifestType: "sui-agent-skill/v1",
      mcp: { compatible: true, tools: [] },
      sui: {
        movePackage: "0x0",
        entry: skillId.trim(),
        policyRequired: [],
      },
      dependencies: [],
    };
  }

  try {
    const registry = getRegistry();
    const skill = registry.publishSkill({
      agentName: agentName.trim(),
      manifest,
      walrusManifestBlob: walrusManifestBlob?.trim(),
      source,
    });
    return NextResponse.json({ skill: registrySkillToRow(skill) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "publish failed";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
