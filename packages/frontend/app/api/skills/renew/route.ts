import {
  DEFAULT_WALRUS_AGGREGATOR,
  WalrusClient,
} from "@agentos-sui/sdk/node";
import { NextRequest, NextResponse } from "next/server";

import { getRegistryStore } from "../../../../lib/registry-server";

export const dynamic = "force-dynamic";

const ALLOWED_EPOCHS = new Set([13, 26, 53, 183]);

/**
 * POST /api/skills/renew
 *
 * Re-uploads a skill's existing manifest bytes with a new epoch count to
 * extend Walrus storage — the same expired-blob problem workflows have
 * (see /api/workflows/[slug]/renew), but for skill manifests
 * (RegistrySkillRecord.walrusManifestBlob).
 *
 * This only refreshes the OFF-chain Walrus blob + the registry's cached
 * endEpoch. It does NOT call `skill_descriptor::update` on-chain (that
 * requires the skill owner's wallet signature, which this unauthenticated
 * server route cannot provide) — the on-chain `manifest_hash`/blobId stay
 * unchanged, which is safe because re-uploading the SAME bytes produces the
 * SAME blobId (Walrus dedupes by content hash), so nothing the chain already
 * points at actually changes; only the blob's lifetime is extended.
 *
 * Body: { agentName: string, skillId: string, epochs: 13 | 26 | 53 | 183 }
 * Returns: { ok: true, blobId: string, endEpoch: number }
 */
export async function POST(request: NextRequest) {
  let body: { agentName?: unknown; skillId?: unknown; epochs?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const agentName =
    typeof body.agentName === "string" ? body.agentName.trim() : "";
  const skillId = typeof body.skillId === "string" ? body.skillId.trim() : "";
  const epochs = Number(body.epochs);

  if (!agentName || !skillId) {
    return NextResponse.json(
      { error: "agentName and skillId are required" },
      { status: 400 },
    );
  }
  if (!ALLOWED_EPOCHS.has(epochs)) {
    return NextResponse.json(
      { error: "epochs must be 13, 26, 53, or 183" },
      { status: 400 },
    );
  }

  const registry = getRegistryStore();
  const skills = await registry.listSkills(agentName);
  const skill = skills.find((s) => s.skillId === skillId);
  if (!skill) {
    return NextResponse.json(
      { error: `Skill not found: ${skillId} (agent: ${agentName})` },
      { status: 404 },
    );
  }

  if (skill.walrusManifestBlob.startsWith("walrus://")) {
    return NextResponse.json(
      { error: "skill manifest has not been uploaded to Walrus — publish the skill first" },
      { status: 422 },
    );
  }

  const walrus = new WalrusClient({ aggregatorUrl: DEFAULT_WALRUS_AGGREGATOR });

  // Download the existing manifest bytes.
  let bytes: Uint8Array;
  try {
    bytes = await walrus.downloadBlob(skill.walrusManifestBlob);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("not found")) {
      return NextResponse.json(
        {
          error:
            "blob expired — content is unrecoverable, re-publish the skill via MCP/CLI instead",
        },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: `Walrus unavailable: ${msg}` },
      { status: 502 },
    );
  }

  // Re-upload with a new epoch count. Same content = same blobId (Walrus
  // dedupes by content hash), endEpoch extended — the on-chain manifest_hash
  // and blobId stay valid, no chain transaction needed.
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

  await registry.publishSkill({
    agentName,
    manifest: {
      name: skill.name,
      version: skill.version.replace(/^v/, ""),
      publisher: skill.mvrPackage,
      manifestType: "sui-agent-skill/v1",
      mcp: { compatible: true, tools: [] },
      sui: { movePackage: "0x0", entry: skill.name, policyRequired: [] },
      dependencies: skill.dependencies ?? [],
    },
    walrusManifestBlob: blobId,
    manifestHash: skill.manifestHash,
    endEpoch,
    objectId: skill.objectId,
    suinsName: skill.suinsName,
    sealPolicyId: skill.sealPolicyId,
    source: skill.source,
  });

  return NextResponse.json({ ok: true, blobId, endEpoch: endEpoch ?? null });
}
