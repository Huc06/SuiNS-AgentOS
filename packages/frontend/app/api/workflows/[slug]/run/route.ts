import { randomUUID } from "node:crypto";

import {
  AgentOSClient,
  contracts,
  DEFAULT_WALRUS_EPOCHS,
  fetchRemoteImage,
  HarborClient,
  memwalFromEnv,
  passportFromRecord,
  descriptorFromRecord,
  resolveAgentAddress,
  runWorkflow,
  sealEncryptHarbor,
  sealEncryptReal,
  serializeManifest,
  validateManifest,
  WalrusClient,
  type RunBuildBundle,
  type RunResolveBundle,
  type SkillManifest,
  type RunContext,
  type WorkflowGraph,
} from "@agentos-sui/sdk/node";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  getAgentosPackageId,
  getSuiNetwork,
  getSuiRpcUrl,
} from "../../../../../lib/enoki-config";
import { loadRootEnv } from "../../../../../lib/load-root-env";
import {
  getRegistryStore,
  getRegistryPath,
} from "../../../../../lib/registry-server";
import { appendRun } from "../../../../../lib/runs-store";
import { sponsoredExecuteServer } from "../../../../../lib/sponsored-execute";

// Belt-and-suspenders: ensure repo-root .env secrets (SUI_PRIVATE_KEY /
// ENOKI_SECRET_KEY / MEMWAL_*) are loaded even if the next.config.ts load was
// skipped. Idempotent; never logs values.
loadRootEnv();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string }> };

const nodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "trigger",
    "walrus",
    "harbor",
    "sui",
    "memory",
    "memory-recall",
    "import-agent",
    "call-sub-agent",
    "delegate",
    "attest",
  ]),
  label: z.string().min(1),
  params: z.record(z.unknown()).optional(),
});

const bodySchema = z.object({
  graph: z
    .object({
      nodes: z.array(nodeSchema).min(1),
      edges: z.array(z.object({ source: z.string(), target: z.string() })),
    })
    .optional(),
  params: z.record(z.unknown()).optional(),
});

/**
 * The default workflow rendered in the editor:
 *   Trigger -> Walrus -> { Harbor, Sui } -> Memory
 * The Sui node carries the agent's passport id + package id so it can record an
 * execution on-chain.
 */
function defaultGraph(
  passportId: string | undefined,
  packageId: string | undefined,
): WorkflowGraph {
  return {
    nodes: [
      { id: "trigger", type: "trigger", label: "Trigger" },
      { id: "walrus", type: "walrus", label: "Walrus" },
      { id: "harbor", type: "harbor", label: "Harbor" },
      {
        id: "sui",
        type: "sui",
        label: "Sui",
        params: {
          ...(passportId ? { passportId } : {}),
          ...(packageId ? { packageId } : {}),
        },
      },
      { id: "memory", type: "memory", label: "Memory" },
    ],
    edges: [
      { source: "trigger", target: "walrus" },
      { source: "walrus", target: "harbor" },
      { source: "walrus", target: "sui" },
      { source: "harbor", target: "memory" },
      { source: "sui", target: "memory" },
    ],
  };
}

function isManifest(value: unknown): value is SkillManifest {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { manifestType?: unknown }).manifestType === "sui-agent-skill/v1"
  );
}

/**
 * Execute a workflow for an agent, fully gasless. The engine itself is
 * signer-agnostic: we inject `execute = sponsoredExecuteServer` (Enoki-sponsored
 * server keypair) and a Walrus-backed `uploadManifest`. The run is persisted so
 * it can be polled via the `runs` routes.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const key = decodeURIComponent(slug).trim();
  if (!key) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  const registry = getRegistryStore();
  let resolved = await registry.resolveAgent(key);
  // The canvas slug may be a WORKFLOW slug (e.g. `rebalance-pipeline-alpha-fund`)
  // rather than an agent slug. A workflow runs under its parent agent's
  // passport, so fall back to resolving the owning agent from the workflow
  // record when the key isn't an agent itself.
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
  const agent = resolved.agent;

  const packageId = getAgentosPackageId();
  const graph = parsed.data.graph ?? defaultGraph(agent.passportId, packageId);

  const suiClient = new SuiGrpcClient({
    network: getSuiNetwork() === "mainnet" ? "mainnet" : "testnet",
    baseUrl: `https://fullnode.${getSuiNetwork() === "mainnet" ? "mainnet" : "testnet"}.sui.io:443`,
  });

  // Walrus-backed uploader (the SDK's storage client). Serializes a real
  // manifest, otherwise uploads JSON/bytes verbatim.
  const uploadManifest = async (
    payload?: unknown,
  ): Promise<{ blobId: string }> => {
    const walrus = new WalrusClient();
    let bytes: Uint8Array;
    if (isManifest(payload)) {
      validateManifest(payload);
      bytes = serializeManifest(payload);
    } else if (payload instanceof Uint8Array) {
      bytes = payload;
    } else {
      bytes = new TextEncoder().encode(JSON.stringify(payload ?? {}));
    }
    return walrus.uploadBlob(bytes, { epochs: DEFAULT_WALRUS_EPOCHS });
  };

  // Walrus-backed agent memory. `null` when MEMWAL_RELAYER_URL / MEMWAL_API_KEY
  // are unset → the memory steps skip gracefully (never crash the run). We wrap
  // the client so a successful `remember` also persists its namespace into the
  // local registry — memwal has no list-namespaces endpoint, so this registry
  // ledger is the only way the canvas can later offer known namespaces. `recall`
  // passes straight through.
  const memwal = memwalFromEnv();
  const memory = memwal
    ? {
        remember: async (ns: string, text: string) => {
          const result = await memwal.remember(ns, text);
          try {
            await getRegistryStore().recordMemoryNamespace(agent.suinsName, ns);
          } catch {
            // Namespace bookkeeping is best-effort; never fail the run for it.
          }
          return result;
        },
        recall: (ns: string, query: string, limit?: number) =>
          memwal.recall(ns, query, limit),
      }
    : null;

  // Real Harbor uploader (the user's Walrus Harbor account). Built from
  // HARBOR_API_KEY + HARBOR_SPACE_ID + HARBOR_BUCKET_ID. `null` when any is
  // unset → the harbor executor falls back to a plain Walrus upload (the blob
  // just does not land in a Harbor account). The SDK engine stays
  // secret-agnostic: it receives this uploader as `ctx.harbor`, never the env.
  const harborApiKey = process.env.HARBOR_API_KEY?.trim();
  const harborSpaceId = process.env.HARBOR_SPACE_ID?.trim();
  const harborBucketId = process.env.HARBOR_BUCKET_ID?.trim();
  const harborSealPolicyId = process.env.HARBOR_SEAL_POLICY_ID?.trim();
  const harborBaseUrl = process.env.HARBOR_BASE_URL?.trim();
  const harbor =
    harborApiKey && harborSpaceId && harborBucketId
      ? {
          ...(harborSealPolicyId ? { sealPolicyId: harborSealPolicyId } : {}),
          upload: async (
            content: Uint8Array,
            filename: string,
            options?: { contentType?: string },
          ) => {
            const client = new HarborClient({
              apiKey: harborApiKey,
              ...(harborBaseUrl ? { baseUrl: harborBaseUrl } : {}),
            });
            const { blobId, fileId } = await client.uploadBlob(
              harborSpaceId,
              harborBucketId,
              content,
              filename,
              { attempts: 30, intervalMs: 1000 }, // Harbor docs: testnet certification commonly completes within 30 seconds.
              options,
            );
            const base = (
              harborBaseUrl ?? "https://api.testnet.harbor.walrus.xyz"
            ).replace(/\/+$/, "");
            return {
              blobId,
              fileId,
              // Harbor streams file content from the bucket file download route.
              url: `${base}/api/v1/buckets/${harborBucketId}/files/${fileId}/download`,
            };
          },
        }
      : null;

  // Active Harbor private buckets require raw Seal ciphertext under Harbor's
  // canonical bucket-policy package. The configured policy takes precedence;
  // the older AgentOS policy helper remains available for non-Harbor runs.
  const sealNetwork = getSuiNetwork() === "mainnet" ? "mainnet" : "testnet";
  const harborSealSuiClient = harborSealPolicyId
    ? new SuiGrpcClient({
        network: sealNetwork,
        baseUrl: `https://fullnode.${sealNetwork}.sui.io:443`,
      })
    : null;
  const seal = harborSealPolicyId
    ? async (data: Uint8Array, sealPolicyId: string) =>
        sealEncryptHarbor({
          data,
          sealPolicyId,
          suiClient: harborSealSuiClient!,
        })
    : packageId
      ? async (data: Uint8Array, sealPolicyId: string) => {
          const r = await sealEncryptReal({
            data,
            sealPolicyId,
            suiClient,
            packageId,
            network: sealNetwork,
            threshold: 1,
          });
          return r ? r.bytes : null;
        }
      : null;

  // A server-side AgentOSClient backs the read-only `resolve` bundle and the
  // unsigned-PTB `build` bundle. It shares the one registry file with the rest
  // of the surfaces and never signs/submits — every on-chain commit still flows
  // through `execute` (sponsoredExecuteServer) below.
  const agentClient = new AgentOSClient({
    client: suiClient as never,
    registryPath: getRegistryPath(),
    ...(packageId ? { packageId } : {}),
  });

  const resolve: RunResolveBundle = {
    // Try on-chain SuiNS resolution first (agentClient.resolveAgent already
    // does this), then fall back to the SAME async RegistryStore this route
    // resolved `agent` from at the top (`registry`) — NOT agentClient's own
    // internal LocalRegistry, which always reads the local `.agentos/
    // registry.json` file. On Vercel with STORAGE_BACKEND=postgres, that file
    // is never written to (the Postgres store is), so falling back to it here
    // would silently resolve stale/seed data instead of what was just
    // published. See docs/storage-adapter.md and lib/db.ts.
    resolveAgent: async (name) => {
      try {
        return await agentClient.resolveAgent(name);
      } catch {
        const found = await registry.resolveAgent(name);
        if (!found) throw new Error(`Agent not found: ${name}`);
        return passportFromRecord(found.agent);
      }
    },
    resolveSkill: async (nameOrId, agentName) => {
      try {
        return await agentClient.resolveSkill(nameOrId, agentName);
      } catch {
        const skills = agentName
          ? await registry.listSkills(agentName)
          : (await registry.getSkills());
        const record = skills.find(
          (s) =>
            s.skillId === nameOrId ||
            s.mvrPackage === nameOrId ||
            s.suinsName === nameOrId,
        );
        if (!record) throw new Error(`Skill not found: ${nameOrId}`);
        return descriptorFromRecord(record);
      }
    },
    listSkills: async (agentName) => {
      try {
        const skills = await agentClient.listSkills(agentName);
        if (skills.length > 0) return skills;
      } catch {
        // fall through to the registry store below
      }
      const records = await registry.listSkills(agentName);
      return records.map(descriptorFromRecord);
    },
    downloadManifest: (blobId, expectedHash, options) =>
      agentClient.downloadManifest(blobId, expectedHash, options),
    // Resolve a `.sui` name to its on-chain 0x address (SuiNS), with a registry
    // fallback. Returns null when unregistered → coordinate executors skip
    // gracefully instead of passing a non-address where one is required.
    resolveAgentAddress: async (name) => {
      try {
        const onchain = await resolveAgentAddress(suiClient as never, name);
        if (onchain) return onchain;
      } catch {
        // SuiNS lookup failed (network / unregistered) → try the registry.
      }
      try {
        const found = await registry.resolveAgent(name);
        if (!found) return null;
        return found.agent.runtimeWallet ?? null;
      } catch {
        return null;
      }
    },
  };

  const build: RunBuildBundle = {
    buildCallSubAgentTx: async (options) => {
      // A bare agent name (e.g. "alpha.sui") is NOT a skill; map it to that
      // agent's real seeded skill so the delegated call resolves a real skill
      // (skillResolved:true) instead of degrading to "did not resolve". Names
      // that already carry a skill prefix ("web-search.alpha.sui") pass through.
      const normalizeSkill = (name: string): string => {
        const slug = (name ?? "").replace(/\.sui$/i, "");
        if (!slug || slug.includes(".")) return name;
        const seeded: Record<string, string> = {
          alpha: "web-search",
          "beta-agent": "sandbox-tool",
          "walrus-bot": "walrus-read",
        };
        return `${seeded[slug] ?? "web-search"}.${slug}.sui`;
      };
      const built = await agentClient.buildExecuteSkillTx({
        ...options,
        suinsName: normalizeSkill(options.suinsName),
      });
      return {
        transaction: built.transaction,
        manifestHash: built.manifestHash,
        verified: built.verified,
        // descriptor === null ⇒ the skill did not resolve and the builder ran
        // the delegation accounting only (degraded path).
        skillResolved: built.descriptor !== null,
      };
    },
    buildDelegateTx: (options) => {
      const tx = new Transaction();
      const cap = tx.add(
        contracts.delegation.grant({
          parentPassport: tx.object(options.parentPassportId),
          childAgent: options.childAgent,
          allowedSkills: options.allowedSkills,
          allowedCapabilities: options.allowedCapabilities,
          spendLimit: BigInt(options.spendLimit),
          expiryMs: BigInt(options.expiryMs),
          ...(packageId ? { packageId } : {}),
        }),
      );
      // Transfer the produced cap to the child so the PTB never dangles.
      tx.transferObjects([cap], options.childAgent);
      return tx;
    },
    buildAttestTx: (options) => {
      const tx = new Transaction();
      tx.add(
        contracts.attestation.attest({
          subjectPassport: tx.object(options.subjectPassportId),
          kind: options.kind,
          score: options.score,
          uri: options.uri,
          ...(options.recipient
            ? { recipient: options.recipient }
            : { share: true }),
          ...(packageId ? { packageId } : {}),
        }),
      );
      return tx;
    },
  };

  const ctx: RunContext = {
    agentName: agent.suinsName,
    passport: {
      id: agent.passportId,
      suinsName: agent.suinsName,
      // Anchor memory to the .sui name (matches the on-chain default).
      memoryNamespace: agent.suinsName,
    },
    ...(parsed.data.params ? { params: parsed.data.params } : {}),
    // Lets the on-chain executors detect "no published package" and skip
    // gracefully (instead of hard-erroring on the MVR placeholder).
    ...(packageId ? { packageId } : {}),
    client: suiClient,
    // `sponsoredExecuteServer` derives the Enoki sponsor allowlist per-call from
    // each PTB (every Move-call target it invokes — incl. a skill's arbitrary
    // movePackage target and the framework `public_share_object` share call —
    // plus every transfer recipient, incl. non-sender ones like a delegate child
    // or an attest recipient), so call-sub-agent / delegate / attest-to-recipient
    // / attest-share are all sponsorable without a static per-flow list here.
    execute: (tx: unknown) => sponsoredExecuteServer(tx as Transaction),
    uploadManifest,
    // This Node-only downloader validates public HTTPS targets, redirects,
    // MIME, signature and streaming size before the Harbor executor sees bytes.
    media: { fetchImage: fetchRemoteImage },
    resolve,
    build,
    ...(memory ? { memory } : {}),
    ...(harbor ? { harbor } : {}),
    ...(seal ? { seal } : {}),
  };

  try {
    const { steps, status } = await runWorkflow(graph, ctx);
    const runId = randomUUID();
    await appendRun({
      runId,
      agentSlug: agent.slug,
      status,
      steps,
      createdAt: new Date().toISOString(),
    });

    // Record every successful on-chain Delegate as a registry delegation so the
    // /delegations graph shows it. The engine creates the DelegationCap on-chain
    // but never touches the registry (the page reads the registry), so a
    // coordinate run would otherwise leave /delegations empty. Best-effort —
    // bookkeeping never fails the run.
    const nowIso = new Date().toISOString();
    const asStr = (v: unknown): string | undefined =>
      typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;
    const asStrArr = (v: unknown): string[] =>
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === "string")
        : [];
    for (const step of steps) {
      if (step.status !== "done" || step.type !== "delegate") continue;
      const out = (step.output ?? {}) as Record<string, unknown>;
      const capId = asStr(out.capId);
      const childAgent = asStr(out.childAgent);
      if (!capId || !childAgent) continue;
      const gnode = graph.nodes.find((n) => n.id === step.nodeId);
      const p = (gnode?.params ?? {}) as Record<string, unknown>;
      const rawExpiry = asStr(p.expiryMs);
      try {
        await registry.addDelegation(agent.slug, {
          childAgent,
          childName: asStr(out.childName) ?? asStr(p.child) ?? childAgent,
          allowedSkills: asStrArr(p.allowedSkills),
          allowedCapabilities: asStrArr(p.allowedCapabilities),
          spendLimit: asStr(p.spendLimit) ?? "0",
          spent: "0",
          // Mirror the executor's far-future default (0/unset cap never expires).
          expiryMs:
            rawExpiry && rawExpiry !== "0" ? rawExpiry : "4102444800000",
          revoked: false,
          capId,
          createdAt: nowIso,
        });
      } catch {
        // Delegation bookkeeping is best-effort; never fail the run for it.
      }
    }

    return NextResponse.json({ runId, steps, status });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "workflow run failed" },
      { status: 500 },
    );
  }
}
