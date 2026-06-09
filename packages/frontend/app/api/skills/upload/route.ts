import { NextRequest, NextResponse } from "next/server";
import {
  HarborClient,
  computeManifestHash,
  serializeManifest,
  validateManifest,
  type SkillManifest,
} from "@agentos/sdk";

export const dynamic = "force-dynamic";

/**
 * Upload a skill manifest to Walrus via the Harbor gateway.
 *
 * The browser cannot hold the Harbor API key (it is a server-side secret), so
 * the upgrade flow POSTs the new manifest here. This route serializes the
 * manifest deterministically, computes its SHA-256 hash, uploads the bytes to
 * Walrus, and returns `{ blobId, manifestHash }` for the client to embed in the
 * on-chain `skill_descriptor::update` transaction (signed by the user's wallet).
 *
 * SECURITY NOTE: this route is currently UNAUTHENTICATED — any caller who can
 * reach it can spend Harbor storage quota. It validates that the body is a
 * well-formed `sui-agent-skill/v1` manifest, but does not verify the caller's
 * identity or wallet ownership of the target SkillDescriptor. On-chain
 * authorization is still enforced by the `update` entry function (owner-only),
 * so an unauthorized upload cannot mutate a descriptor — but it can consume
 * storage. Add auth (session/signature check) before exposing publicly.
 */
export async function POST(request: NextRequest) {
  let body: { manifest?: SkillManifest };
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

  // Validate the manifest conforms to sui-agent-skill/v1 before spending quota.
  try {
    validateManifest(manifest);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid manifest" },
      { status: 400 },
    );
  }

  let apiKey: string;
  try {
    apiKey = HarborClient.getApiKey();
  } catch {
    return NextResponse.json(
      {
        error:
          "Harbor API key not configured. Set HARBOR_API_KEY or add harborApiKey to .agentos/config.json",
      },
      { status: 503 },
    );
  }

  const spaceId = process.env.HARBOR_SPACE_ID?.trim();
  if (!spaceId) {
    return NextResponse.json(
      { error: "Harbor space ID not configured. Set HARBOR_SPACE_ID" },
      { status: 503 },
    );
  }
  const bucketId = process.env.HARBOR_BUCKET_ID?.trim() || "default";

  try {
    const serialized = serializeManifest(manifest);
    const manifestHash = computeManifestHash(serialized);
    const harbor = new HarborClient({ apiKey });
    const { blobId } = await harbor.uploadBlob(
      spaceId,
      bucketId,
      serialized,
      `${manifest.name}-${manifest.version}.json`,
    );
    return NextResponse.json({ blobId, manifestHash });
  } catch (e) {
    const message = e instanceof Error ? e.message : "upload failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
