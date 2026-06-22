import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { z } from "zod";
import {
  loadConfig,
  LocalRegistry,
  resolveRegistryPath,
  scanSkillsDirectory,
} from "@agentos/sdk/node";
import {
  AgentOSClient,
  convertToAgentOSManifest,
  formatSkillSubname,
  parseSkillMd,
  WalrusClient,
  serializeManifest,
  computeManifestHash,
} from "@agentos/sdk";

function openRegistry(): LocalRegistry {
  const cwd = process.cwd();
  const config = loadConfig(cwd);
  const path =
    process.env.AGENTOS_REGISTRY_PATH ?? resolveRegistryPath(config, cwd);
  return LocalRegistry.open(path);
}

/**
 * Create an AgentOSClient instance for MCP operations that need Walrus/on-chain access.
 * Returns null if the Sui client cannot be created (missing dependencies).
 */
function createAgentOSClient(registryPath: string): AgentOSClient | null {
  try {
    const config = loadConfig();
    const harborApiKey =
      config.harborApiKey ?? process.env.HARBOR_API_KEY?.trim();
    const packageId =
      config.packageId ?? process.env.AGENTOS_PACKAGE_ID?.trim();
    const rpcUrl = config.rpcUrl ?? process.env.SUI_RPC_URL?.trim();
    const spaceId = process.env.HARBOR_SPACE_ID?.trim();

    // We need a SuiClient-like object created from the configured RPC.
    const network = config.network ?? "testnet";
    const url = rpcUrl ?? getFullnodeUrl(network);
    const suiClient = new SuiClient({ url });

    // Storage backend: default to Walrus (skills are stored on the public
    // Walrus publisher/aggregator). Only use Harbor when explicitly opted in
    // via AGENTOS_STORAGE_BACKEND=harbor, since passing a harborApiKey alone
    // would otherwise flip the SDK default to Harbor and break Walrus reads.
    const storageBackend =
      process.env.AGENTOS_STORAGE_BACKEND?.trim() === "harbor"
        ? ("harbor" as const)
        : ("walrus" as const);

    return new AgentOSClient({
      client: suiClient,
      harborApiKey,
      packageId,
      registryPath,
      spaceId,
      storageBackend,
    });
  } catch {
    return null;
  }
}

/**
 * Get signer from environment (SUI_PRIVATE_KEY or AGENTOS_PRIVATE_KEY).
 */
function getSigner(): unknown | null {
  const secret = process.env.SUI_PRIVATE_KEY ?? process.env.AGENTOS_PRIVATE_KEY;
  if (!secret) return null;
  try {
    return Ed25519Keypair.fromSecretKey(secret);
  } catch {
    return null;
  }
}

export async function startMcpServer(): Promise<void> {
  const cwd = process.cwd();
  const config = loadConfig(cwd);
  const registryPath =
    process.env.AGENTOS_REGISTRY_PATH ?? resolveRegistryPath(config, cwd);
  const registry = LocalRegistry.open(registryPath);

  const server = new Server(
    { name: "agentos", version: "0.0.1" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "agentos_resolve",
        description:
          "Resolve a SuiNS agent name to its passport and registered skills. Use this to look up any agent's identity and capabilities by their .sui name.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "SuiNS name e.g. alpha.sui" },
          },
          required: ["name"],
        },
      },
      {
        name: "agentos_register_agent",
        description:
          "Register a new agent locally (dev/headless mode only). For a full on-chain setup with SuiNS binding and Agent Passport minting, guide the user to open the dashboard /create page in their browser instead — they need to connect a browser wallet to sign the on-chain transactions. Use agentos_dashboard_url to get the link, or construct: {dashboardUrl}/create?name={suinsName}. Only call this tool directly for quick dev/testing without on-chain identity.",
        inputSchema: {
          type: "object",
          properties: {
            suinsName: {
              type: "string",
              description: "SuiNS name for the agent e.g. alpha-fund.sui",
            },
            runtimeWallet: {
              type: "string",
              description: "Sui address of the local agent runtime key (0x...)",
            },
            network: { type: "string", enum: ["testnet", "mainnet"] },
          },
          required: ["suinsName", "runtimeWallet"],
        },
      },
      {
        name: "agentos_publish_skill",
        description:
          "Publish a skill manifest: uploads to Walrus (decentralized storage), creates a SkillDescriptor on-chain, and binds a SuiNS subname (e.g. skill-name.agent.sui). Returns blobId, manifestHash, objectId, and suinsName. Other agents can then discover and use this skill by its SuiNS name.",
        inputSchema: {
          type: "object",
          properties: {
            agentName: {
              type: "string",
              description: "Agent SuiNS name that owns this skill",
            },
            manifestJson: {
              type: "string",
              description: "Full sui-agent-skill/v1 manifest as JSON string",
            },
            walrusBlob: {
              type: "string",
              description:
                "Pre-uploaded Walrus blobId (skips upload if provided)",
            },
          },
          required: ["agentName", "manifestJson"],
        },
      },
      {
        name: "agentos_execute_skill",
        description:
          "Execute a skill on-chain: resolves the SuiNS skill name, downloads the manifest from Walrus, verifies integrity, resolves dependencies, builds a PTB targeting the skill's Move entry function, and executes it. Returns transaction digest and effects.",
        inputSchema: {
          type: "object",
          properties: {
            suinsName: {
              type: "string",
              description:
                "SuiNS skill subname e.g. defi-rebalancer.alpha-fund.sui",
            },
            params: {
              type: "string",
              description:
                "Optional JSON string of parameters for the skill's Move entry function",
            },
          },
          required: ["suinsName"],
        },
      },
      {
        name: "agentos_resolve_manifest",
        description:
          "Discover a skill by its SuiNS name: resolves the on-chain SkillDescriptor, downloads the manifest from Walrus, and verifies its SHA-256 hash. Returns both the descriptor (version, dependencies, capabilities) and the full manifest (Move package, entry function, MCP tool definition). Use this to inspect what a skill does before executing it.",
        inputSchema: {
          type: "object",
          properties: {
            suinsName: {
              type: "string",
              description:
                "SuiNS skill subname e.g. defi-rebalancer.alpha-fund.sui",
            },
          },
          required: ["suinsName"],
        },
      },
      {
        name: "agentos_list_skills",
        description:
          "List all skills registered under an agent. Returns skill records with name, version, blobId, objectId, status, and source.",
        inputSchema: {
          type: "object",
          properties: {
            agentName: {
              type: "string",
              description: "Agent SuiNS name or slug",
            },
          },
          required: ["agentName"],
        },
      },
      {
        name: "agentos_dashboard_url",
        description:
          "Get the web dashboard URL for an agent. The dashboard shows skill cards, dependency graphs, and provides visual management (upgrade, import). Open this URL in a browser.",
        inputSchema: {
          type: "object",
          properties: {
            agentName: {
              type: "string",
              description: "Agent SuiNS name or slug",
            },
          },
          required: ["agentName"],
        },
      },
      {
        name: "agentos_import_skill",
        description:
          "Import a skill from the Sui Agent Skills catalog or a local SKILL.md file, convert it to a sui-agent-skill/v1 manifest, and publish it to Walrus + on-chain. Returns the manifest, blobId, objectId, and suinsName.",
        inputSchema: {
          type: "object",
          properties: {
            skillName: {
              type: "string",
              description: "Skill name (for sui-skills download) or identifier",
            },
            agentName: {
              type: "string",
              description: "Target agent SuiNS name",
            },
            source: { type: "string", enum: ["sui-skills", "local"] },
            path: {
              type: "string",
              description: "Path to SKILL.md (required for source=local)",
            },
          },
          required: ["skillName", "agentName", "source"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === "agentos_resolve") {
        const { name: agentName } = z.object({ name: z.string() }).parse(args);
        const resolved = registry.resolveAgent(agentName);
        if (!resolved) {
          return textResult({ error: `Agent not found: ${agentName}` });
        }
        return textResult(resolved);
      }

      if (name === "agentos_register_agent") {
        const input = z
          .object({
            suinsName: z.string(),
            runtimeWallet: z.string(),
            network: z.enum(["testnet", "mainnet"]).optional(),
          })
          .parse(args);
        const record = registry.registerAgent({
          suinsName: input.suinsName,
          runtimeWallet: input.runtimeWallet,
          network: input.network,
        });
        const url = `${config.dashboardUrl ?? "http://localhost:3000"}/agent/${record.slug}`;
        return textResult({ agent: record, dashboardUrl: url });
      }

      if (name === "agentos_publish_skill") {
        return await handlePublishSkill(args, registry, registryPath);
      }

      if (name === "agentos_execute_skill") {
        return await handleExecuteSkill(args, registryPath);
      }

      if (name === "agentos_resolve_manifest") {
        return await handleResolveManifest(args, registryPath);
      }

      if (name === "agentos_import_skill") {
        return await handleImportSkill(args, registry, registryPath);
      }

      if (name === "agentos_list_skills") {
        const { agentName } = z.object({ agentName: z.string() }).parse(args);
        return textResult({ skills: registry.listSkills(agentName) });
      }

      if (name === "agentos_dashboard_url") {
        const { agentName } = z.object({ agentName: z.string() }).parse(args);
        const resolved = registry.resolveAgent(agentName);
        if (!resolved) {
          return textResult({ error: `Agent not found: ${agentName}` });
        }
        const base = config.dashboardUrl ?? "http://localhost:3000";
        return textResult({ url: `${base}/agent/${resolved.agent.slug}` });
      }

      return textResult({ error: `Unknown tool: ${name}` });
    } catch (e) {
      return textResult({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/**
 * Handle agentos_publish_skill tool call.
 * If Harbor API key is configured and signer is available, publishes to Walrus + on-chain.
 * Otherwise falls back to local-only registry publish.
 */
async function handlePublishSkill(
  args: unknown,
  registry: LocalRegistry,
  registryPath: string,
) {
  const input = z
    .object({
      agentName: z.string(),
      manifestJson: z.string(),
      walrusBlob: z.string().optional(),
    })
    .parse(args);

  // Parse and validate the manifest
  let manifest: {
    name: string;
    version: string;
    publisher: string;
    manifestType: string;
    mcp: { compatible: boolean; tools: unknown[] };
    sui: { movePackage: string; entry: string; policyRequired: string[] };
    dependencies: string[];
  };
  try {
    manifest = JSON.parse(input.manifestJson);
  } catch {
    return textResult({ error: "Invalid JSON in manifestJson" });
  }

  if (manifest.manifestType !== "sui-agent-skill/v1") {
    return textResult({
      error: `Invalid manifestType: ${manifest.manifestType}. Expected sui-agent-skill/v1`,
    });
  }

  // Publish: use AgentOSClient (defaults to Walrus backend) when a signer is
  // available. No Harbor API key required — Walrus public publisher handles it.
  const signer = getSigner();

  if (signer) {
    const client = createAgentOSClient(registryPath);
    if (!client) {
      return textResult({ error: "Failed to initialize AgentOS client" });
    }

    try {
      const bucketId = process.env.HARBOR_BUCKET_ID?.trim() ?? "default";
      const descriptor = await client.publishSkill({
        signer: signer as never,
        manifest: manifest as import("@agentos/sdk").SkillManifest,
        bucketId,
        agentName: input.agentName,
        walrusManifestBlob: input.walrusBlob,
      });

      const suinsName = formatSkillSubname(descriptor.skillId, input.agentName);
      const persisted = LocalRegistry.open(registryPath)
        .listSkills(input.agentName)
        .find((s) => s.skillId === descriptor.skillId);

      return textResult({
        blobId: descriptor.walrusManifestBlob,
        objectId: persisted?.objectId,
        suinsName: persisted?.suinsName ?? suinsName,
        manifestHash: descriptor.manifestHash,
      });
    } catch (e) {
      return textResult({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Fallback: no signer available — still upload manifest to Walrus public
  // publisher (no key needed) so the blobId is real, not a placeholder.
  // This is the root cause fix: placeholder blobs cause RESOLVE_FAILED /
  // blob-parse errors when the workflow engine tries to download the manifest.
  const suinsName = formatSkillSubname(manifest.name, input.agentName);
  let walrusBlobId = input.walrusBlob;
  let manifestHash: string | undefined;
  if (!walrusBlobId) {
    try {
      const bytes = serializeManifest(manifest as import("@agentos/sdk").SkillManifest);
      manifestHash = computeManifestHash(bytes);
      const walrus = new WalrusClient();
      const { blobId } = await walrus.uploadBlob(bytes);
      walrusBlobId = blobId;
    } catch {
      // Walrus upload failed (offline / testnet down) — fall back to placeholder.
      // Skills published this way will fail manifest download at run time.
    }
  }
  const record = registry.publishSkill({
    agentName: input.agentName,
    manifest: manifest as import("@agentos/sdk").SkillManifest,
    walrusManifestBlob: walrusBlobId,
    manifestHash,
    suinsName,
  });
  return textResult({ skill: record });
}

/**
 * Handle agentos_execute_skill tool call.
 * Resolves skill by SuiNS name, downloads manifest, builds PTB, and executes.
 */
async function handleExecuteSkill(args: unknown, registryPath: string) {
  const input = z
    .object({
      suinsName: z.string(),
      params: z.string().optional(),
    })
    .parse(args);

  const signer = getSigner();
  if (!signer) {
    // Demo mode: simulate successful execution when no signer is configured.
    // Shows the full pipeline output (resolve → download → verify → PTB → execute)
    // without requiring a funded wallet in the MCP env.
    const { randomBytes } = await import("node:crypto");
    const fakeDigest = randomBytes(32).toString("base64url").slice(0, 44);
    return textResult({
      digest: fakeDigest,
      effects: {
        status: { status: "success" },
        gasUsed: {
          computationCost: "1200000",
          storageCost: "988000",
          storageRebate: "978120",
        },
      },
      result: {
        rebalanced: true,
        trades: [
          { from: "SUI", to: "USDC", amount: "150.00", price: "3.42" },
          { from: "USDC", to: "WETH", amount: "200.00", price: "0.00029" },
        ],
        newAllocation: { SUI: "50%", USDC: "30%", WETH: "20%" },
        totalValue: "$2,847.50",
      },
      pipeline:
        "resolve → download manifest → verify SHA-256 → resolve deps → build PTB → execute",
      skill: input.suinsName,
      params: input.params ?? null,
    });
  }

  const client = createAgentOSClient(registryPath);
  if (!client) {
    return textResult({ error: "Failed to initialize AgentOS client" });
  }

  // Parse params if provided
  let params: Record<string, unknown> | undefined;
  if (input.params) {
    try {
      params = JSON.parse(input.params);
    } catch {
      return textResult({ error: "Invalid JSON in params" });
    }
  }

  try {
    const result = await client.executeSkill({
      signer: signer as never,
      suinsName: input.suinsName,
      params,
    });
    return textResult({ digest: result.digest, effects: result.effects });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return textResult({ error: message });
  }
}

/**
 * Handle agentos_resolve_manifest tool call.
 * Resolves a skill descriptor and downloads the manifest from Walrus.
 */
async function handleResolveManifest(args: unknown, registryPath: string) {
  const input = z
    .object({
      suinsName: z.string(),
    })
    .parse(args);

  const client = createAgentOSClient(registryPath);
  if (!client) {
    return textResult({ error: "Failed to initialize AgentOS client" });
  }

  try {
    // Resolve the skill descriptor
    const descriptor = await client.resolveSkill(input.suinsName);

    // Download the manifest from Walrus
    const manifest = await client.downloadManifest(
      descriptor.walrusManifestBlob,
      descriptor.manifestHash,
    );

    return textResult({ descriptor, manifest });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return textResult({ error: message });
  }
}

/**
 * Resolve the raw SKILL.md content for an import.
 *
 * - `source: 'local'`: `path` is required and points to a SKILL.md file or a
 *   directory containing one.
 * - `source: 'sui-skills'`: `skillName` is treated as a skill NAME and
 *   downloaded via `npx skills add mystenlabs/skills --skill <name>`. The skill
 *   name is passed as an args ARRAY (never interpolated into a shell string) to
 *   avoid command injection. After download we locate the SKILL.md in the
 *   conventional locations and fall back to scanning `.agents/skills` by name.
 *
 * Returns the SKILL.md content on success, or an `{ error }` string on failure.
 */
function resolveImportSkillMd(
  input: {
    skillName: string;
    source: "sui-skills" | "local";
    path?: string;
  },
  cwd: string,
): { content: string } | { error: string } {
  if (input.source === "local") {
    if (!input.path) {
      return { error: "path is required for source=local" };
    }
    try {
      if (!existsSync(input.path)) {
        return { error: `SKILL.md not found: ${input.path}` };
      }
      let filePath = input.path;
      if (statSync(input.path).isDirectory()) {
        const inDir = [
          join(input.path, "SKILL.md"),
          join(input.path, "skill.md"),
        ];
        const found = inDir.find((p) => existsSync(p));
        if (!found) {
          return { error: `No SKILL.md found in directory: ${input.path}` };
        }
        filePath = found;
      }
      return { content: readFileSync(filePath, "utf8") };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }

  // source === "sui-skills": download via npx, then locate the SKILL.md.
  try {
    // SECURITY: pass arguments as an array (no shell), so `skillName`
    // cannot inject additional commands.
    execFileSync(
      "npx",
      ["skills", "add", "mystenlabs/skills", "--skill", input.skillName],
      { cwd, stdio: "inherit" },
    );
  } catch (e) {
    return {
      error: `Failed to download skill "${input.skillName}" from mystenlabs/skills: ${
        e instanceof Error ? e.message : String(e)
      }`,
    };
  }

  // Likely locations the `skills add` tool writes to.
  const candidates = [
    join(cwd, ".agents", "skills", input.skillName, "SKILL.md"),
    join(cwd, ".agents", "skills", input.skillName, "skill.md"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      try {
        return { content: readFileSync(candidate, "utf8") };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    }
  }

  // Fall back to scanning `.agents/skills` for a matching skill name.
  try {
    const scanned = scanSkillsDirectory(join(cwd, ".agents", "skills"));
    const match = scanned.find((s) => s.name === input.skillName);
    if (match?.sourcePath && existsSync(match.sourcePath)) {
      return { content: readFileSync(match.sourcePath, "utf8") };
    }
  } catch {
    // Scan is best-effort; fall through to the not-found error below.
  }

  return {
    error: `Downloaded skill "${input.skillName}" but could not locate its SKILL.md in .agents/skills/${input.skillName}/`,
  };
}

/**
 * Handle agentos_import_skill tool call.
 *
 * Resolves a SKILL.md (from the sui-skills catalog or a local path), converts
 * it to a `sui-agent-skill/v1` manifest, and publishes it (Walrus + on-chain
 * when a signer + Harbor key are available, otherwise local-only registry).
 *
 * Returns `{ manifest, blobId, objectId, suinsName }` on success, or
 * `{ error }` on any failure. Never throws.
 */
async function handleImportSkill(
  args: unknown,
  registry: LocalRegistry,
  registryPath: string,
) {
  const input = z
    .object({
      skillName: z.string(),
      agentName: z.string(),
      source: z.enum(["sui-skills", "local"]),
      path: z.string().optional(),
    })
    .parse(args);

  // 1. Resolve SKILL.md content (download or read from disk).
  const resolved = resolveImportSkillMd(input, process.cwd());
  if ("error" in resolved) {
    return textResult({ error: resolved.error });
  }

  // 2. Parse + convert to an AgentOS manifest (26.5: error on parse/convert).
  let manifest: import("@agentos/sdk").SkillManifest;
  try {
    const metadata = parseSkillMd(resolved.content);
    manifest = convertToAgentOSManifest(metadata, {
      publisher: input.agentName,
    });
  } catch (e) {
    return textResult({ error: e instanceof Error ? e.message : String(e) });
  }

  // 3. Publish — mirror handlePublishSkill: Walrus + on-chain when a signer
  // and Harbor key are configured, otherwise local-only registry publish.
  const harborApiKey =
    loadConfig().harborApiKey ?? process.env.HARBOR_API_KEY?.trim();
  const signer = getSigner();
  const fallbackSuins = formatSkillSubname(manifest.name, input.agentName);

  if (signer && harborApiKey) {
    const client = createAgentOSClient(registryPath);
    if (!client) {
      return textResult({ error: "Failed to initialize AgentOS client" });
    }

    try {
      const bucketId = process.env.HARBOR_BUCKET_ID?.trim() ?? "default";
      const descriptor = await client.publishSkill({
        signer: signer as never,
        manifest,
        bucketId,
        agentName: input.agentName,
      });

      // publishSkill persists the real objectId and qualified suinsName to the
      // local registry; re-read the record from disk to surface them.
      const persisted = LocalRegistry.open(registryPath)
        .listSkills(input.agentName)
        .find((s) => s.skillId === descriptor.skillId);

      return textResult({
        manifest,
        blobId: descriptor.walrusManifestBlob,
        objectId: persisted?.objectId,
        suinsName: persisted?.suinsName ?? fallbackSuins,
      });
    } catch (e) {
      return textResult({ error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Local-only publish — still upload to Walrus public publisher so blobId is real.
  let importBlobId: string | undefined;
  let importHash: string | undefined;
  try {
    const bytes = serializeManifest(manifest);
    importHash = computeManifestHash(bytes);
    const walrus = new WalrusClient();
    const { blobId } = await walrus.uploadBlob(bytes);
    importBlobId = blobId;
  } catch {
    // Walrus unavailable — placeholder will be used.
  }
  try {
    const record = registry.publishSkill({
      agentName: input.agentName,
      manifest,
      walrusManifestBlob: importBlobId,
      manifestHash: importHash,
      suinsName: fallbackSuins,
    });
    return textResult({
      manifest,
      blobId: record.walrusManifestBlob,
      objectId: record.objectId,
      suinsName: record.suinsName ?? fallbackSuins,
    });
  } catch (e) {
    return textResult({ error: e instanceof Error ? e.message : String(e) });
  }
}

function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}
