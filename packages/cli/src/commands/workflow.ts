import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { Command } from "commander";

import { createCliContext } from "../lib/context.js";
import { printError, printJson } from "../lib/output.js";

// ─── DRAFT GRAPH STORAGE ──────────────────────────────────────────────────
//
// A workflow's on-chain/registry record only stores the PUBLISHED manifest
// (Walrus blob + hash). While the graph is being assembled from the terminal
// (create → add-node → add-edge → publish) it lives in a small local draft
// file at `.agentos/workflows/<slug>.json`, mirroring how the canvas holds
// in-progress graph state in the browser before "Publish".

interface WorkflowDraft {
  agentName: string;
  name: string;
  suinsName: string;
  description?: string;
  nodes: { id: string; type: string; label: string; params?: Record<string, unknown> }[];
  edges: { source: string; target: string }[];
}

const WORKFLOW_NODE_TYPES = new Set([
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
]);

function draftsDir(cwd: string): string {
  return join(cwd, ".agentos", "workflows");
}

function draftPath(cwd: string, slug: string): string {
  return join(draftsDir(cwd), `${slug}.json`);
}

function readDraft(cwd: string, slug: string): WorkflowDraft {
  const path = draftPath(cwd, slug);
  if (!existsSync(path)) {
    printError(
      `No draft found for workflow "${slug}". Run "agentos workflow create" first.`,
    );
  }
  return JSON.parse(readFileSync(path, "utf8")) as WorkflowDraft;
}

function writeDraft(cwd: string, slug: string, draft: WorkflowDraft): void {
  const path = draftPath(cwd, slug);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(draft, null, 2)}\n`, "utf8");
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\.sui$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Push the current draft's nodes/edges into the registry's `draftGraph`
 * field, so the web canvas (which reads the same `.agentos/registry.json`
 * file in local dev) can render live progress while composing a workflow
 * from the terminal — no separate sync step needed.
 */
function syncDraftToRegistry(
  ctx: ReturnType<typeof createCliContext>,
  draft: WorkflowDraft,
): void {
  ctx.registry.publishWorkflow({
    agentName: draft.agentName,
    name: draft.name,
    suinsName: draft.suinsName,
    status: "draft",
    // Node/edge shapes are validated against WORKFLOW_NODE_TYPES before being
    // pushed onto the draft, so this cast to the SDK's stricter WorkflowGraph
    // (narrowed `type`) is safe.
    draftGraph: { nodes: draft.nodes, edges: draft.edges } as never,
    ...(draft.description ? { description: draft.description } : {}),
  });
}

export const workflowCommand = new Command("workflow").description(
  "Compose, publish, and run multi-step workflows (skill DAGs)",
);

// ─── INIT ─────────────────────────────────────────────────────────────────

/** A minimal, realistic starter graph: trigger -> sui, with a placeholder
 * description. Kept small so a first-time user can read the whole file at a
 * glance and understand the shape before adding more nodes. */
function starterTemplate(name: string) {
  return {
    description: `${name} workflow`,
    nodes: [
      { id: "start", type: "trigger", label: "Start" },
      { id: "action", type: "sui", label: "Execute on-chain action" },
    ],
    edges: [{ source: "start", target: "action" }],
  };
}

workflowCommand
  .command("init [name]")
  .description(
    "Print a starter workflow JSON template to stdout (redirect it to a file, edit, then `workflow create --file`)",
  )
  .action((name: string | undefined) => {
    const template = starterTemplate(name ?? "my-workflow");
    console.log(JSON.stringify(template, null, 2));
  });

// ─── CREATE ───────────────────────────────────────────────────────────────

workflowCommand
  .command("create <name>")
  .description(
    "Start a workflow under an agent (composes into a SuiNS subname, e.g. name.agent.sui). " +
      "Without --file, starts an empty draft to build with add-node/add-edge. " +
      "With --file, loads the full graph from a JSON file (see `workflow init` for the shape).",
  )
  .requiredOption("--agent <name>", "Owning agent SuiNS name")
  .option("--description <text>", "Human-readable summary")
  .option(
    "--file <path>",
    "Load nodes/edges (and optionally description) from a JSON file",
  )
  .option(
    "--publish",
    "Immediately publish after loading --file (requires --file; skips the draft stage)",
  )
  .option("--json", "JSON output")
  .action(
    async (
      name: string,
      opts: {
        agent: string;
        description?: string;
        file?: string;
        publish?: boolean;
        json?: boolean;
      },
    ) => {
      const ctx = createCliContext();

      if (opts.publish && !opts.file) {
        printError("--publish requires --file (nothing to publish otherwise).");
      }

      const resolved = ctx.registry.resolveAgent(opts.agent);
      if (!resolved) {
        printError(`Agent not found: ${opts.agent}`);
      }

      const { formatSkillSubname } = await import("@agentos-sui/sdk");
      const suinsName = formatSkillSubname(name, opts.agent);
      const slug = slugify(suinsName);

      if (existsSync(draftPath(ctx.cwd, slug))) {
        printError(
          `A draft already exists for "${suinsName}". Edit it with "workflow add-node"/"add-edge", or "workflow publish" it.`,
        );
      }

      // Load nodes/edges from --file when given; otherwise start empty (the
      // classic add-node/add-edge flow).
      let nodes: WorkflowDraft["nodes"] = [];
      let edges: WorkflowDraft["edges"] = [];
      let description = opts.description;

      if (opts.file) {
        if (!existsSync(opts.file)) {
          printError(`File not found: ${opts.file}`);
        }
        let parsed: {
          description?: string;
          nodes?: WorkflowDraft["nodes"];
          edges?: WorkflowDraft["edges"];
        };
        try {
          parsed = JSON.parse(readFileSync(opts.file, "utf8"));
        } catch (e) {
          printError(
            `Invalid JSON in ${opts.file}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
        if (!Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
          printError(`${opts.file}: "nodes" must be a non-empty array.`);
        }
        for (const n of parsed.nodes) {
          if (!WORKFLOW_NODE_TYPES.has(n.type)) {
            printError(
              `${opts.file}: node "${n.id}" has invalid type "${n.type}". Expected one of: ${[...WORKFLOW_NODE_TYPES].join(", ")}`,
            );
          }
        }
        nodes = parsed.nodes;
        edges = Array.isArray(parsed.edges) ? parsed.edges : [];
        description = description ?? parsed.description;
      }

      const draft: WorkflowDraft = {
        agentName: opts.agent,
        name,
        suinsName,
        ...(description ? { description } : {}),
        nodes,
        edges,
      };
      writeDraft(ctx.cwd, slug, draft);
      syncDraftToRegistry(ctx, draft);

      if (opts.publish) {
        await publishDraft(ctx, slug, opts.json);
        return;
      }

      if (opts.json) {
        printJson({ slug, suinsName, draft });
      } else {
        console.log(`Created workflow draft "${suinsName}"`);
        console.log(`  Slug:  ${slug}`);
        console.log(`  Draft: ${draftPath(ctx.cwd, slug)}`);
        console.log(`  Nodes: ${nodes.length}, Edges: ${edges.length}`);
        console.log("");
        console.log("Next steps:");
        if (nodes.length === 0) {
          console.log(
            `  agentos workflow add-node ${slug} --id <id> --type <${[...WORKFLOW_NODE_TYPES].join("|")}> --label <label>`,
          );
          console.log(`  agentos workflow add-edge ${slug} --from <id> --to <id>`);
        }
        console.log(`  agentos workflow publish ${slug}`);
        console.log(`  agentos workflow run ${slug}   (after publish)`);
      }
    },
  );

// ─── ADD-NODE ─────────────────────────────────────────────────────────────

workflowCommand
  .command("add-node <slug>")
  .description("Add a node to a workflow draft's graph")
  .requiredOption("--id <id>", "Unique node id within the graph")
  .requiredOption(
    "--type <type>",
    `Node type: ${[...WORKFLOW_NODE_TYPES].join(", ")}`,
  )
  .requiredOption("--label <label>", "Human-readable node label")
  .option("--params <json>", "JSON object of node parameters")
  .option("--json", "JSON output")
  .action(
    (
      slug: string,
      opts: { id: string; type: string; label: string; params?: string; json?: boolean },
    ) => {
      const ctx = createCliContext();
      const draft = readDraft(ctx.cwd, slug);

      if (!WORKFLOW_NODE_TYPES.has(opts.type)) {
        printError(
          `Invalid node type "${opts.type}". Expected one of: ${[...WORKFLOW_NODE_TYPES].join(", ")}`,
        );
      }
      if (draft.nodes.some((n) => n.id === opts.id)) {
        printError(`Node id "${opts.id}" already exists in this draft.`);
      }

      let params: Record<string, unknown> | undefined;
      if (opts.params) {
        try {
          params = JSON.parse(opts.params) as Record<string, unknown>;
        } catch {
          printError(`Invalid JSON for --params: ${opts.params}`);
        }
      }

      draft.nodes.push({
        id: opts.id,
        type: opts.type,
        label: opts.label,
        ...(params ? { params } : {}),
      });
      writeDraft(ctx.cwd, slug, draft);
      syncDraftToRegistry(ctx, draft);

      if (opts.json) {
        printJson({ slug, node: draft.nodes[draft.nodes.length - 1] });
      } else {
        console.log(`Added node "${opts.id}" (${opts.type}) to ${slug}`);
      }
    },
  );

// ─── ADD-EDGE ─────────────────────────────────────────────────────────────

workflowCommand
  .command("add-edge <slug>")
  .description("Connect two nodes in a workflow draft's graph")
  .requiredOption("--from <id>", "Source node id")
  .requiredOption("--to <id>", "Target node id")
  .option("--json", "JSON output")
  .action((slug: string, opts: { from: string; to: string; json?: boolean }) => {
    const ctx = createCliContext();
    const draft = readDraft(ctx.cwd, slug);

    const ids = new Set(draft.nodes.map((n) => n.id));
    if (!ids.has(opts.from)) {
      printError(`Unknown source node id: ${opts.from}`);
    }
    if (!ids.has(opts.to)) {
      printError(`Unknown target node id: ${opts.to}`);
    }

    draft.edges.push({ source: opts.from, target: opts.to });
    writeDraft(ctx.cwd, slug, draft);
    syncDraftToRegistry(ctx, draft);

    if (opts.json) {
      printJson({ slug, edge: { source: opts.from, target: opts.to } });
    } else {
      console.log(`Added edge ${opts.from} -> ${opts.to} in ${slug}`);
    }
  });

// ─── GRAPH (inspect) ──────────────────────────────────────────────────────

workflowCommand
  .command("graph <slug>")
  .description("Print a workflow draft's current graph")
  .option("--json", "JSON output")
  .action((slug: string, opts: { json?: boolean }) => {
    const ctx = createCliContext();
    const draft = readDraft(ctx.cwd, slug);

    if (opts.json) {
      printJson(draft);
    } else {
      console.log(`Workflow: ${draft.suinsName}`);
      if (draft.description) console.log(`  ${draft.description}`);
      console.log(`  Nodes (${draft.nodes.length}):`);
      for (const n of draft.nodes) {
        console.log(`    [${n.id}] ${n.type} — ${n.label}`);
      }
      console.log(`  Edges (${draft.edges.length}):`);
      for (const e of draft.edges) {
        console.log(`    ${e.source} -> ${e.target}`);
      }
    }
  });

// ─── PUBLISH ──────────────────────────────────────────────────────────────

/**
 * Validate + serialize a draft's graph, upload it to Walrus, and flip the
 * workflow's registry record to `active`. Shared by the standalone `publish`
 * command and `create --file --publish` (create-then-publish in one step).
 */
async function publishDraft(
  ctx: ReturnType<typeof createCliContext>,
  slug: string,
  json?: boolean,
): Promise<void> {
  const draft = readDraft(ctx.cwd, slug);

  if (draft.nodes.length === 0) {
    printError(
      `Workflow "${slug}" has no nodes yet. Add at least one with "workflow add-node".`,
    );
  }

  const { validateWorkflowManifest, serializeWorkflowManifest, computeWorkflowManifestHash, WORKFLOW_MANIFEST_TYPE } =
    await import("@agentos-sui/sdk");

  const manifest = {
    name: draft.name,
    version: "1.0.0",
    publisher: draft.agentName,
    manifestType: WORKFLOW_MANIFEST_TYPE,
    ...(draft.description ? { description: draft.description } : {}),
    graph: { nodes: draft.nodes, edges: draft.edges },
    dependencies: [],
  };

  try {
    validateWorkflowManifest(manifest as never);
  } catch (e) {
    printError(e instanceof Error ? e.message : String(e));
  }

  try {
    const { DEFAULT_WALRUS_EPOCHS } = await import("@agentos-sui/sdk/node");
    const { getWalrusUploader } = await import(
      "@agentos-sui/sdk/walrus-mainnet"
    );
    const serialized = serializeWorkflowManifest(manifest as never);
    const manifestHash = computeWorkflowManifestHash(serialized);
    const walrus = getWalrusUploader({
      network: ctx.network,
      signer: ctx.getSigner() ?? undefined,
    });
    const { blobId, endEpoch } = await walrus.uploadBlob(serialized, {
      epochs: DEFAULT_WALRUS_EPOCHS,
    });

    const record = ctx.registry.publishWorkflow({
      agentName: draft.agentName,
      name: draft.name,
      suinsName: draft.suinsName,
      version: manifest.version,
      walrusManifestBlob: blobId,
      manifestHash,
      endEpoch,
      status: "active",
      draftGraph: null,
      ...(draft.description ? { description: draft.description } : {}),
    });

    const dashboard = `${ctx.config.dashboardUrl ?? "http://localhost:3000"}/agent/${record.agentSlug}`;

    if (json) {
      printJson({ blobId, manifestHash, workflow: record, dashboardUrl: dashboard });
    } else {
      console.log(`Published workflow "${draft.suinsName}"`);
      console.log(`  Blob ID:       ${blobId}`);
      console.log(`  Manifest Hash: ${manifestHash}`);
      console.log(`  Status:        ${record.status}`);
      console.log(`  Dashboard:     ${dashboard}`);
      console.log("");
      console.log(`Run it:  agentos workflow run ${slug}`);
    }
  } catch (e) {
    printError(e instanceof Error ? e.message : String(e));
  }
}

workflowCommand
  .command("publish <slug>")
  .description(
    "Validate, upload the draft graph to Walrus, and activate the workflow's SuiNS subname",
  )
  .option("--dry-run", "Validate and print the manifest without uploading")
  .option("--json", "JSON output")
  .action(async (slug: string, opts: { dryRun?: boolean; json?: boolean }) => {
    const ctx = createCliContext();

    if (opts.dryRun) {
      const draft = readDraft(ctx.cwd, slug);
      if (draft.nodes.length === 0) {
        printError(
          `Workflow "${slug}" has no nodes yet. Add at least one with "workflow add-node".`,
        );
      }
      const { validateWorkflowManifest, WORKFLOW_MANIFEST_TYPE } = await import(
        "@agentos-sui/sdk"
      );
      const manifest = {
        name: draft.name,
        version: "1.0.0",
        publisher: draft.agentName,
        manifestType: WORKFLOW_MANIFEST_TYPE,
        ...(draft.description ? { description: draft.description } : {}),
        graph: { nodes: draft.nodes, edges: draft.edges },
        dependencies: [],
      };
      try {
        validateWorkflowManifest(manifest as never);
      } catch (e) {
        printError(e instanceof Error ? e.message : String(e));
      }
      if (opts.json) {
        printJson({ manifest });
      } else {
        console.log(`Manifest for "${draft.suinsName}" (dry-run, not published):`);
        console.log(JSON.stringify(manifest, null, 2));
      }
      return;
    }

    await publishDraft(ctx, slug, opts.json);
  });

// ─── RUN ──────────────────────────────────────────────────────────────────

workflowCommand
  .command("run <slug>")
  .description(
    "Download a published workflow's manifest from Walrus and execute it step-by-step on-chain (requires SUI_PRIVATE_KEY or AGENTOS_PRIVATE_KEY)",
  )
  .option("--params <json>", "JSON object of run-level parameters")
  .option("--json", "JSON output")
  .action(
    async (slug: string, opts: { params?: string; json?: boolean }) => {
      const ctx = createCliContext();

      const workflow = ctx.registry.findWorkflowBySlug(slug);
      if (!workflow) {
        printError(`Workflow not found: ${slug}`);
      }
      if (!workflow.walrusManifestBlob) {
        printError(
          `Workflow "${slug}" has not been published yet. Run "agentos workflow publish ${slug}" first.`,
        );
      }

      const signer = ctx.getSigner();
      if (!signer) {
        printError(
          "A signer is required to run a workflow on-chain. Set SUI_PRIVATE_KEY or AGENTOS_PRIVATE_KEY.",
        );
      }

      let params: Record<string, unknown> | undefined;
      if (opts.params) {
        try {
          params = JSON.parse(opts.params) as Record<string, unknown>;
        } catch {
          printError(`Invalid JSON for --params: ${opts.params}`);
        }
      }

      const resolvedAgent = ctx.registry.resolveAgent(workflow.agentSlug);
      if (!resolvedAgent) {
        printError(`Workflow owner not found: ${workflow.agentSlug}`);
      }
      const agent = resolvedAgent.agent;

      try {
        const {
          computeWorkflowManifestHash,
          validateWorkflowManifest,
          runWorkflow,
          AgentOSClient,
          resolveAgentAddress,
          contracts,
        } = await import("@agentos-sui/sdk/node");
        const { getWalrusUploader, createMainnetWalrusUploader } =
          await import("@agentos-sui/sdk/walrus-mainnet");
        const { Transaction } = await import("@mysten/sui/transactions");
        const { executeTransaction } = await import("../lib/execute-move.js");

        // 1. Download + verify the published manifest.
        const walrus = getWalrusUploader({ network: ctx.network });
        const bytes = await walrus.downloadBlob(workflow.walrusManifestBlob);
        if (workflow.manifestHash) {
          const actual = computeWorkflowManifestHash(bytes);
          if (actual !== workflow.manifestHash) {
            printError(
              `Manifest hash mismatch for "${slug}" (blob may be tampered or stale).`,
            );
          }
        }
        const manifest = JSON.parse(new TextDecoder().decode(bytes));
        validateWorkflowManifest(manifest);

        if (!opts.json) {
          console.log(`Running "${manifest.name}" (${workflow.suinsName})`);
          console.log(`  ${manifest.graph.nodes.length} node(s), ${manifest.graph.edges.length} edge(s)`);
          console.log("");
        }

        // 2. Build the read-only resolve bundle + unsigned-PTB build bundle
        // from a registry-backed AgentOSClient (same pattern as the web run
        // route, minus gas sponsorship — the CLI signs directly).
        const packageId = ctx.config.packageId;
        const agentClient = new AgentOSClient({
          client: ctx.suiClient as never,
          registryPath: ctx.registryPath,
          ...(packageId ? { packageId } : {}),
        });

        const resolve = {
          resolveAgent: (name: string) => agentClient.resolveAgent(name),
          resolveSkill: (nameOrId: string, agentName?: string) =>
            agentClient.resolveSkill(nameOrId, agentName),
          listSkills: (agentName: string) => agentClient.listSkills(agentName),
          downloadManifest: (
            blobId: string,
            expectedHash: string,
            options?: { sealPolicyId?: string },
          ) => agentClient.downloadManifest(blobId, expectedHash, options),
          resolveAgentAddress: async (name: string) => {
            try {
              return await resolveAgentAddress(ctx.suiClient as never, name);
            } catch {
              return null;
            }
          },
        };

        const build = {
          buildCallSubAgentTx: async (options: never) => {
            const built = await agentClient.buildExecuteSkillTx(options);
            return {
              transaction: built.transaction,
              manifestHash: built.manifestHash,
              verified: built.verified,
              skillResolved: built.descriptor !== null,
            };
          },
          buildDelegateTx: (options: {
            parentPassportId: string;
            childAgent: string;
            allowedSkills: string[];
            allowedCapabilities: string[];
            spendLimit: bigint | number;
            expiryMs: bigint | number;
          }) => {
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
            tx.transferObjects([cap], options.childAgent);
            return tx;
          },
          buildAttestTx: (options: {
            subjectPassportId: string;
            attesterPassportId: string;
            kind: string;
            score: number;
            uri: string;
            recipient?: string;
            share?: boolean;
          }) => {
            const tx = new Transaction();
            tx.add(
              contracts.attestation.attest({
                subjectPassport: tx.object(options.subjectPassportId),
                attesterPassport: tx.object(options.attesterPassportId),
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

        // 3. Best-effort optional pieces: memory/harbor/seal only activate when
        // their env vars are present — otherwise the executors skip gracefully
        // (this mirrors RunContext's documented behavior, never crashes a run).
        const { memwalFromEnv } = await import("@agentos-sui/sdk/node");
        const memwal = memwalFromEnv();
        const memory = memwal
          ? {
              remember: (ns: string, text: string) => memwal.remember(ns, text),
              recall: (ns: string, query: string, limit?: number) =>
                memwal.recall(ns, query, limit),
            }
          : undefined;

        const harborApiKey = process.env.HARBOR_API_KEY?.trim();
        const harborSpaceId = process.env.HARBOR_SPACE_ID?.trim();
        const harborBucketId = process.env.HARBOR_BUCKET_ID?.trim();
        let harbor: { upload: (content: Uint8Array, filename: string, options?: { contentType?: string }) => Promise<{ blobId: string; fileId?: string; url?: string }> } | undefined;
        if (harborApiKey && harborSpaceId && harborBucketId) {
          const { HarborClient } = await import("@agentos-sui/sdk/node");
          const harborBaseUrl = process.env.HARBOR_BASE_URL?.trim();
          harbor = {
            upload: async (content, filename, options) => {
              const client = new HarborClient({
                apiKey: harborApiKey,
                ...(harborBaseUrl ? { baseUrl: harborBaseUrl } : {}),
              });
              const { blobId, fileId } = await client.uploadBlob(
                harborSpaceId,
                harborBucketId,
                content,
                filename,
                { attempts: 30, intervalMs: 1000 },
                options,
              );
              const base = (harborBaseUrl ?? "https://api.testnet.harbor.walrus.xyz").replace(/\/+$/, "");
              return {
                blobId,
                fileId,
                url: `${base}/api/v1/buckets/${harborBucketId}/files/${fileId}/download`,
              };
            },
          };
        }

        // 4. Assemble the RunContext. `execute` signs + submits directly with
        // the CLI signer (no gas sponsorship) — the CLI operator pays gas.
        const runCtx = {
          agentName: agent.suinsName,
          passport: {
            id: agent.passportId,
            suinsName: agent.suinsName,
            memoryNamespace: agent.suinsName,
          },
          ...(params ? { params } : {}),
          ...(packageId ? { packageId } : {}),
          client: ctx.suiClient,
          execute: async (tx: unknown) => {
            const { digest } = await executeTransaction({
              transaction: tx as never,
              suiClient: ctx.suiClient,
              signer,
            });
            return { digest };
          },
          resolve,
          build,
          ...(memory ? { memory } : {}),
          ...(harbor ? { harbor } : {}),
        };

        // 5. Run, printing each step as it settles.
        const { steps, status } = await runWorkflow(manifest.graph, runCtx as never, {
          onStep: (step) => {
            if (opts.json) return;
            const icon =
              step.status === "done"
                ? "✓"
                : step.status === "error"
                  ? "✗"
                  : step.status === "skipped"
                    ? "○"
                    : "…";
            console.log(`  ${icon} [${step.nodeId}] ${step.type} — ${step.status}`);
            if (step.txDigest) console.log(`      tx: ${step.txDigest}`);
            if (step.blobId) console.log(`      blob: ${step.blobId}`);
            if (step.error) console.log(`      error: ${step.error}`);
            if (step.remediation) console.log(`      fix: ${step.remediation}`);
          },
        });

        if (opts.json) {
          printJson({ status, steps });
        } else {
          console.log("");
          console.log(`Run ${status === "done" ? "completed" : "failed"}.`);
        }
      } catch (e) {
        printError(e instanceof Error ? e.message : String(e));
      }
    },
  );

// ─── LIST ─────────────────────────────────────────────────────────────────

workflowCommand
  .command("list [agentName]")
  .description("List workflows (optionally filtered by agent)")
  .option("--json", "JSON output")
  .action((agentName: string | undefined, opts: { json?: boolean }) => {
    const ctx = createCliContext();
    const workflows = agentName
      ? ctx.registry.listWorkflows(agentName)
      : ctx.registry.getWorkflows();

    if (opts.json) {
      printJson({ workflows });
    } else {
      if (workflows.length === 0) {
        console.log("No workflows found.");
        return;
      }
      for (const w of workflows) {
        console.log(
          `${w.suinsName}  ${w.version}  [${w.network}]  ${w.status}  (${w.slug})`,
        );
      }
    }
  });
