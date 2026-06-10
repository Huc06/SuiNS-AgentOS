import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { Command } from "commander";

import { createCliContext } from "../lib/context.js";
import { formatDryRun } from "../lib/dry-run.js";
import { readManifestFile } from "../lib/manifest.js";
import { printError, printJson } from "../lib/output.js";

export const skillCommand = new Command("skill").description("Manage skills");

// ─── PUBLISH ──────────────────────────────────────────────────────────────────

skillCommand
  .command("publish [file]")
  .description(
    "Register a skill manifest (local registry; Walrus + on-chain when configured). " +
      "In a Suiperpower workspace, omit <file> to auto-assemble the manifest from the build output.",
  )
  .requiredOption("--agent <name>", "Target agent SuiNS name")
  .option("--walrus <blobId>", "Walrus manifest blob id or URL")
  .option(
    "--from-suiperpower [outputDir]",
    "Assemble the manifest from a Suiperpower build output directory (defaults to .suiperpower/output/)",
  )
  .option(
    "--private <sealPolicyId>",
    "Seal policy ID for private skill encryption",
  )
  .option("--dry-run", "Print Move transaction for SkillDescriptor::create")
  .option("--json", "JSON output")
  .action(
    async (
      file: string | undefined,
      opts: {
        agent: string;
        walrus?: string;
        fromSuiperpower?: string | boolean;
        private?: string;
        dryRun?: boolean;
        json?: boolean;
      },
    ) => {
      const ctx = createCliContext();

      // ─── RESOLVE MANIFEST SOURCE ──────────────────────────────────────────
      // Precedence:
      //   1. --from-suiperpower flag → Suiperpower flow (explicit flag wins).
      //   2. <file> argument         → read manifest from file (classic path).
      //   3. no file + a detected Suiperpower workspace → auto Suiperpower flow.
      //   4. nothing usable          → error.
      let manifest;
      let suiperpowerActive = false;
      let detectedPackageId: string | undefined;
      let detectedBlobId: string | undefined;

      const fromSuiperpower = opts.fromSuiperpower !== undefined;

      if (!fromSuiperpower && file) {
        // Classic path: explicit manifest file.
        try {
          manifest = readManifestFile(file);
        } catch (e) {
          printError(e instanceof Error ? e.message : String(e));
        }
      } else {
        const {
          detectSuperpowerProject,
          parseSuiperpowerOutput,
          buildManifestFromSuperpowerOutput,
        } = await import("@agentos/sdk/node");

        // Decide whether the Suiperpower flow applies.
        if (!fromSuiperpower && !detectSuperpowerProject(ctx.cwd)) {
          printError(
            "No manifest file provided. Pass a manifest <file>, use --from-suiperpower, " +
              "or run inside a Suiperpower workspace.",
          );
        }

        suiperpowerActive = true;

        // Resolve the output directory (flag value or the default location).
        const outputDir =
          typeof opts.fromSuiperpower === "string"
            ? opts.fromSuiperpower
            : join(ctx.cwd, ".suiperpower", "output");

        let result;
        try {
          result = parseSuiperpowerOutput(outputDir);
        } catch (e) {
          printError(e instanceof Error ? e.message : String(e));
        }

        manifest = buildManifestFromSuperpowerOutput(result, {
          agentName: opts.agent,
        });
        detectedPackageId = result.packageId;
        detectedBlobId = result.walrusBlobId;

        // ─── COMBINED FLOW HEADER (25.3) ───────────────────────────────────
        if (!opts.json) {
          console.log("Detected Suiperpower build");
          console.log(`  packageId: ${detectedPackageId ?? "(none)"}`);
          console.log(
            `  manifest generated: ${manifest.name} v${manifest.version}`,
          );
        }
      }

      // Explicit --walrus wins over a blob id detected in the Suiperpower output.
      const effectiveBlob = opts.walrus ?? detectedBlobId;

      const harborApiKey =
        process.env.HARBOR_API_KEY?.trim() || ctx.config.harborApiKey;

      // ─── DRY-RUN ──────────────────────────────────────────────────────────
      if (opts.dryRun) {
        // For the Suiperpower flow, surface the assembled manifest so the user
        // can inspect what would be published.
        if (suiperpowerActive && !opts.json) {
          console.log("Assembled manifest:");
          console.log(JSON.stringify(manifest, null, 2));
        }
        const suiperpowerExtra = suiperpowerActive
          ? { manifest, packageId: detectedPackageId ?? null }
          : {};
        if (harborApiKey) {
          // Show Walrus upload parameters and serialized PTB bytes
          const walrusParams = {
            harborBaseUrl: "https://api.testnet.harbor.walrus.xyz",
            spaceId: process.env.HARBOR_SPACE_ID ?? "(from config)",
            bucketId: "(skill bucket)",
            filename: `${manifest.name}-${manifest.version}.json`,
            sealPolicyId: opts.private ?? undefined,
          };
          const { transaction } = ctx.agentos.tx.createSkillDescriptor({
            skillId: manifest.name,
            walrusManifestBlob: `walrus://pending/${manifest.name}`,
            manifestHash: `0x(sha256-of-serialized-manifest)`,
            mvrPackageName: manifest.publisher,
            version: manifest.version,
          });
          const result = await formatDryRun(
            transaction,
            ctx.suiClient,
            ctx.config,
            "createSkillDescriptor",
          );
          if (opts.json) {
            printJson({ ...result, walrusParams, ...suiperpowerExtra });
          } else {
            console.log("Walrus upload parameters:");
            console.log(`  Harbor URL: ${walrusParams.harborBaseUrl}`);
            console.log(`  Filename:   ${walrusParams.filename}`);
            if (effectiveBlob) {
              console.log(`  Blob ID:    ${effectiveBlob} (pre-uploaded)`);
            }
            if (walrusParams.sealPolicyId) {
              console.log(`  Seal Policy: ${walrusParams.sealPolicyId}`);
            }
            console.log("");
            console.log(result.note);
            if (result.txBytes) console.log(result.txBytes);
          }
        } else {
          // Fallback: local-only dry-run (original behavior)
          const walrus = effectiveBlob ?? `walrus://pending/${manifest.name}`;
          const hash = `0x${manifest.name}-hash`;
          const { transaction } = ctx.agentos.tx.createSkillDescriptor({
            skillId: manifest.name,
            walrusManifestBlob: walrus,
            manifestHash: hash,
            mvrPackageName: manifest.publisher,
            version: manifest.version,
          });
          const result = await formatDryRun(
            transaction,
            ctx.suiClient,
            ctx.config,
            "createSkillDescriptor",
          );
          if (opts.json) {
            printJson({ ...result, ...suiperpowerExtra });
          } else {
            console.log(result.note);
            if (result.txBytes) console.log(result.txBytes);
          }
        }
        return;
      }

      // ─── WALRUS + ON-CHAIN PUBLISH ────────────────────────────────────────
      // With Walrus as the default storage backend, publishing on-chain only
      // needs a signer — no Harbor API key required. (Harbor remains opt-in via
      // its own env/config and the SDK storageBackend option.)
      const signer = ctx.getSigner();
      if (signer) {
        try {
          const { formatSkillSubname } = await import("@agentos/sdk");
          if (suiperpowerActive && !opts.json) {
            if (effectiveBlob) {
              console.log(`  using pre-uploaded Walrus blob: ${effectiveBlob}`);
            } else {
              console.log("  uploading to Walrus...");
            }
            console.log("  registering on-chain...");
          }
          const descriptor = await ctx.agentos.publishSkill({
            signer,
            manifest,
            bucketId: process.env.HARBOR_BUCKET_ID ?? "default",
            agentName: opts.agent,
            walrusManifestBlob: effectiveBlob,
            ...(opts.private
              ? { private: { sealPolicyId: opts.private } }
              : {}),
          });

          const suinsName = formatSkillSubname(manifest.name, opts.agent);

          // Update local registry for tracking
          const record = ctx.registry.publishSkill({
            agentName: opts.agent,
            manifest,
            walrusManifestBlob: descriptor.walrusManifestBlob,
            manifestHash: descriptor.manifestHash,
            suinsName,
            sealPolicyId: opts.private,
          });

          const objectId = record.objectId;

          if (opts.json) {
            printJson({
              blobId: descriptor.walrusManifestBlob,
              manifestHash: descriptor.manifestHash,
              objectId,
              suinsName,
            });
          } else {
            console.log(
              `Published ${manifest.name} ${manifest.version} (Walrus + on-chain)`,
            );
            console.log(`  Blob ID:       ${descriptor.walrusManifestBlob}`);
            console.log(`  Manifest Hash: ${descriptor.manifestHash}`);
            console.log(`  Object ID:     ${objectId}`);
            console.log(`  SuiNS Name:    ${suinsName}`);
          }
        } catch (e) {
          printError(e instanceof Error ? e.message : String(e));
        }
        return;
      }

      // ─── LOCAL-ONLY PUBLISH (fallback when no Harbor API key) ─────────────
      try {
        const record = ctx.registry.publishSkill({
          agentName: opts.agent,
          manifest,
          walrusManifestBlob: effectiveBlob,
        });
        const dashboard = `${ctx.config.dashboardUrl ?? "http://localhost:3000"}/agent/${record.agentSlug}`;
        if (opts.json) {
          printJson({
            blobId: record.walrusManifestBlob ?? null,
            manifestHash: record.manifestHash ?? null,
            objectId: record.objectId ?? null,
            suinsName: record.suinsName ?? null,
          });
        } else {
          console.log(`Published ${record.mvrPackage} ${record.version}`);
          console.log(`  Object:   ${record.objectId}`);
          console.log(`  Walrus:   ${record.walrusManifestBlob}`);
          console.log(`  Manage:   ${dashboard}`);
        }
      } catch (e) {
        printError(e instanceof Error ? e.message : String(e));
      }
    },
  );

// ─── IMPORT ─────────────────────────────────────────────────────────────────

/**
 * Resolve the raw SKILL.md content for an import.
 *
 * - `--from-sui-skills`: treat `nameOrPath` as a skill NAME and download it via
 *   `npx skills add mystenlabs/skills --skill <name>`. The CLI argument is
 *   passed as an args array (never interpolated into a shell string) to avoid
 *   command injection. After download we locate the SKILL.md in the
 *   conventional locations and fall back to scanning `.agents/skills` by name.
 * - otherwise: treat `nameOrPath` as a filesystem path to a SKILL.md file or a
 *   directory containing one.
 */
async function resolveSkillMdContent(
  nameOrPath: string,
  fromSuiSkills: boolean | undefined,
  cwd: string,
): Promise<string> {
  if (fromSuiSkills) {
    try {
      // SECURITY: pass arguments as an array (no shell), so `nameOrPath`
      // cannot inject additional commands.
      execFileSync(
        "npx",
        ["skills", "add", "mystenlabs/skills", "--skill", nameOrPath],
        { cwd, stdio: "inherit" },
      );
    } catch (e) {
      printError(
        `Failed to download skill "${nameOrPath}" from mystenlabs/skills: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }

    // Likely locations the `skills add` tool writes to.
    const candidates = [
      join(cwd, ".agents", "skills", nameOrPath, "SKILL.md"),
      join(cwd, ".agents", "skills", nameOrPath, "skill.md"),
      join(cwd, nameOrPath, "SKILL.md"),
      join(cwd, nameOrPath, "skill.md"),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return readFileSync(candidate, "utf8");
      }
    }

    // Fall back to scanning `.agents/skills` for a matching skill name.
    try {
      const { scanSkillsDirectory } = await import("@agentos/sdk/node");
      const scanned = scanSkillsDirectory(join(cwd, ".agents", "skills"));
      const match = scanned.find((s) => s.name === nameOrPath);
      if (match?.sourcePath && existsSync(match.sourcePath)) {
        return readFileSync(match.sourcePath, "utf8");
      }
    } catch {
      // Scan is best-effort; fall through to the error below.
    }

    printError(
      `Downloaded skill "${nameOrPath}" but could not locate its SKILL.md. ` +
        `Looked in .agents/skills/${nameOrPath}/ and ./${nameOrPath}/.`,
    );
  }

  // Path-based import: file or directory containing SKILL.md.
  if (!existsSync(nameOrPath)) {
    printError(`SKILL.md not found: ${nameOrPath}`);
  }

  let filePath = nameOrPath;
  if (statSync(nameOrPath).isDirectory()) {
    const inDir = [join(nameOrPath, "SKILL.md"), join(nameOrPath, "skill.md")];
    const found = inDir.find((p) => existsSync(p));
    if (!found) {
      printError(`No SKILL.md found in directory: ${nameOrPath}`);
    }
    filePath = found as string;
  }

  return readFileSync(filePath, "utf8");
}

skillCommand
  .command("import <name-or-path>")
  .description("Import a Sui Agent Skill (SKILL.md) into the AgentOS registry")
  .requiredOption("--agent <name>", "Target agent SuiNS name")
  .option(
    "--from-sui-skills",
    "Treat <name-or-path> as a skill name to download from mystenlabs/skills",
  )
  .option(
    "--move-package <id>",
    "Move package id to back the skill (instruction-only if omitted)",
  )
  .option(
    "--private <sealPolicyId>",
    "Seal policy ID for private skill encryption",
  )
  .option("--dry-run", "Print the converted manifest JSON without publishing")
  .option("--json", "JSON output")
  .action(
    async (
      nameOrPath: string,
      opts: {
        agent: string;
        fromSuiSkills?: boolean;
        movePackage?: string;
        private?: string;
        dryRun?: boolean;
        json?: boolean;
      },
    ) => {
      const ctx = createCliContext();

      const { parseSkillMd, convertToAgentOSManifest, formatSkillSubname } =
        await import("@agentos/sdk");

      // 1. Resolve SKILL.md content (download or read from disk).
      const content = await resolveSkillMdContent(
        nameOrPath,
        opts.fromSuiSkills,
        ctx.cwd,
      );

      // 2. Parse + convert to an AgentOS manifest.
      let manifest;
      try {
        const metadata = parseSkillMd(content);
        manifest = convertToAgentOSManifest(metadata, {
          publisher: opts.agent,
          ...(opts.movePackage ? { movePackage: opts.movePackage } : {}),
        });
      } catch (e) {
        printError(e instanceof Error ? e.message : String(e));
      }

      const manifestSummary = (m: typeof manifest) => ({
        version: m.version,
        publisher: m.publisher,
        backing: m.sui.movePackage
          ? `move:${m.sui.movePackage}`
          : "instruction-only",
        tools: m.mcp.tools.length,
      });

      // 3. Dry-run: show converted manifest JSON, do not publish.
      if (opts.dryRun) {
        if (opts.json) {
          printJson({ manifest });
        } else {
          console.log(`Converted ${manifest.name} (dry-run, not published)`);
          console.log(JSON.stringify(manifest, null, 2));
        }
        return;
      }

      const harborApiKey =
        process.env.HARBOR_API_KEY?.trim() || ctx.config.harborApiKey;

      // 4a. Walrus + on-chain publish (when Harbor key + signer available).
      if (harborApiKey) {
        const signer = ctx.getSigner();
        if (!signer) {
          printError(
            "A signer is required for Walrus publish. Set SUI_PRIVATE_KEY or AGENTOS_PRIVATE_KEY environment variable.",
          );
        }

        try {
          const descriptor = await ctx.agentos.publishSkill({
            signer,
            manifest,
            bucketId: process.env.HARBOR_BUCKET_ID ?? "default",
            agentName: opts.agent,
            ...(opts.private
              ? { private: { sealPolicyId: opts.private } }
              : {}),
          });

          const suinsName = formatSkillSubname(manifest.name, opts.agent);

          const record = ctx.registry.publishSkill({
            agentName: opts.agent,
            manifest,
            walrusManifestBlob: descriptor.walrusManifestBlob,
            manifestHash: descriptor.manifestHash,
            suinsName,
            sealPolicyId: opts.private,
          });

          if (opts.json) {
            printJson({
              manifest,
              blobId: descriptor.walrusManifestBlob,
              manifestHash: descriptor.manifestHash,
              objectId: record.objectId,
              suinsName,
            });
          } else {
            const summary = manifestSummary(manifest);
            console.log(
              `Imported ${manifest.name} ${manifest.version} (Walrus + on-chain)`,
            );
            console.log(
              `  Manifest:   v${summary.version} · ${summary.publisher} · ${summary.backing} · ${summary.tools} tool(s)`,
            );
            console.log(`  Blob ID:    ${descriptor.walrusManifestBlob}`);
            console.log(`  SuiNS Name: ${suinsName}`);
          }
        } catch (e) {
          printError(e instanceof Error ? e.message : String(e));
        }
        return;
      }

      // 4b. Local-only publish fallback (no Harbor API key).
      try {
        const record = ctx.registry.publishSkill({
          agentName: opts.agent,
          manifest,
          sealPolicyId: opts.private,
        });

        if (opts.json) {
          printJson({
            manifest,
            blobId: record.walrusManifestBlob ?? null,
            manifestHash: record.manifestHash ?? null,
            objectId: record.objectId ?? null,
            suinsName: record.suinsName ?? null,
          });
        } else {
          const summary = manifestSummary(manifest);
          console.log(
            `Imported ${manifest.name} ${manifest.version} (local registry)`,
          );
          console.log(
            `  Manifest:   v${summary.version} · ${summary.publisher} · ${summary.backing} · ${summary.tools} tool(s)`,
          );
          console.log(`  Blob ID:    ${record.walrusManifestBlob}`);
          console.log(`  SuiNS Name: ${record.suinsName ?? "(local only)"}`);
        }
      } catch (e) {
        printError(e instanceof Error ? e.message : String(e));
      }
    },
  );

// ─── SCAN ─────────────────────────────────────────────────────────────────────

/**
 * Per-skill outcome recorded during a scan.
 */
interface ScanSkillResult {
  name: string;
  status: "published" | "skipped" | "error";
  suinsName?: string;
  blobId?: string;
  message?: string;
}

skillCommand
  .command("scan")
  .description(
    "Scan .agents/skills/ and ~/.agents/skills/ for SKILL.md files and publish new ones",
  )
  .requiredOption("--agent <name>", "Target agent SuiNS name")
  .option("--force", "Re-publish skills even if already registered (upgrade)")
  .option(
    "--move-package <id>",
    "Move package id to back discovered skills (instruction-only if omitted)",
  )
  .option(
    "--dir <path>",
    "Override the scan roots with a single directory to scan",
  )
  .option("--json", "JSON output")
  .action(
    async (opts: {
      agent: string;
      force?: boolean;
      movePackage?: string;
      dir?: string;
      json?: boolean;
    }) => {
      const ctx = createCliContext();

      const { convertToAgentOSManifest, formatSkillSubname } =
        await import("@agentos/sdk");
      const { scanSkillsDirectory } = await import("@agentos/sdk/node");

      // 1. Determine scan roots: an explicit --dir override, or the two
      //    conventional locations (cwd-local first so it wins de-duplication).
      const roots = opts.dir
        ? [opts.dir]
        : [
            join(ctx.cwd, ".agents", "skills"),
            join(homedir(), ".agents", "skills"),
          ];

      // 2. Scan all roots and de-duplicate by skill name (first wins, so a
      //    cwd-local skill takes precedence over a home-directory one).
      const seen = new Set<string>();
      const discovered: ReturnType<typeof scanSkillsDirectory> = [];
      for (const root of roots) {
        for (const metadata of scanSkillsDirectory(root)) {
          if (seen.has(metadata.name)) continue;
          seen.add(metadata.name);
          discovered.push(metadata);
        }
      }

      // 3. Existing registry skills for this agent, indexed by name.
      const existingNames = new Set(
        ctx.registry.listSkills(opts.agent).map((s) => s.name),
      );

      const harborApiKey =
        process.env.HARBOR_API_KEY?.trim() || ctx.config.harborApiKey;
      const signer = harborApiKey ? ctx.getSigner() : null;

      const results: ScanSkillResult[] = [];
      let published = 0;
      let skipped = 0;

      // 4. Process each discovered skill.
      for (const metadata of discovered) {
        let manifest;
        try {
          manifest = convertToAgentOSManifest(metadata, {
            publisher: opts.agent,
            ...(opts.movePackage ? { movePackage: opts.movePackage } : {}),
          });
        } catch (e) {
          results.push({
            name: metadata.name,
            status: "error",
            message: e instanceof Error ? e.message : String(e),
          });
          continue;
        }

        // Skip already-registered skills unless --force requests an upgrade.
        if (existingNames.has(manifest.name) && !opts.force) {
          skipped += 1;
          results.push({ name: manifest.name, status: "skipped" });
          continue;
        }

        try {
          if (harborApiKey && signer) {
            // Walrus + on-chain publish (publishSkill detects existing
            // registry records and performs the upgrade flow on --force).
            const descriptor = await ctx.agentos.publishSkill({
              signer,
              manifest,
              bucketId: process.env.HARBOR_BUCKET_ID ?? "default",
              agentName: opts.agent,
            });
            const suinsName = formatSkillSubname(manifest.name, opts.agent);
            ctx.registry.publishSkill({
              agentName: opts.agent,
              manifest,
              walrusManifestBlob: descriptor.walrusManifestBlob,
              manifestHash: descriptor.manifestHash,
              suinsName,
            });
            published += 1;
            results.push({
              name: manifest.name,
              status: "published",
              suinsName,
              blobId: descriptor.walrusManifestBlob,
            });
          } else {
            // Local-only fallback (no Harbor API key or signer).
            const record = ctx.registry.publishSkill({
              agentName: opts.agent,
              manifest,
            });
            published += 1;
            results.push({
              name: manifest.name,
              status: "published",
              ...(record.suinsName ? { suinsName: record.suinsName } : {}),
              ...(record.walrusManifestBlob
                ? { blobId: record.walrusManifestBlob }
                : {}),
            });
          }
        } catch (e) {
          results.push({
            name: manifest.name,
            status: "error",
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }

      const errors = results.filter((r) => r.status === "error").length;

      // 5. Output.
      if (opts.json) {
        printJson({
          found: discovered.length,
          published,
          skipped,
          errors,
          skills: results,
        });
        return;
      }

      console.log(
        `${discovered.length} skill(s) found, ${published} new (published), ${skipped} skipped (already registered)` +
          (errors > 0 ? `, ${errors} error(s)` : ""),
      );
      for (const r of results) {
        if (r.status === "published") {
          console.log(
            `  + ${r.name}${r.suinsName ? ` → ${r.suinsName}` : ""}${
              r.blobId ? ` (${r.blobId})` : ""
            }`,
          );
        } else if (r.status === "skipped") {
          console.log(`  = ${r.name} (already registered)`);
        } else {
          console.log(`  ! ${r.name}: ${r.message}`);
        }
      }
    },
  );

// ─── EXECUTE ──────────────────────────────────────────────────────────────────

skillCommand
  .command("execute <suinsName>")
  .description("Resolve and execute a skill by SuiNS name")
  .option("--params <json>", "JSON parameters for the skill entry function")
  .option(
    "--dry-run",
    "Build PTB and print serialized transaction bytes without executing",
  )
  .option("--json", "JSON output of digest and effects")
  .action(
    async (
      suinsName: string,
      opts: { params?: string; dryRun?: boolean; json?: boolean },
    ) => {
      const ctx = createCliContext();

      const signer = ctx.getSigner();
      if (!signer) {
        printError(
          "A signer is required for skill execution. Set SUI_PRIVATE_KEY or AGENTOS_PRIVATE_KEY environment variable.",
        );
      }

      // Parse params if provided
      let params: Record<string, unknown> | undefined;
      if (opts.params) {
        try {
          params = JSON.parse(opts.params) as Record<string, unknown>;
        } catch {
          printError(`Invalid JSON for --params: ${opts.params}`);
        }
      }

      try {
        // 1. Resolve the skill descriptor
        const descriptor = await ctx.agentos.resolveSkill(suinsName);

        // 2. Download the manifest
        const manifest = await ctx.agentos.downloadManifest(
          descriptor.walrusManifestBlob,
          descriptor.manifestHash,
          descriptor.sealPolicyId
            ? { sealPolicyId: descriptor.sealPolicyId }
            : undefined,
        );

        // 3. Resolve dependencies and print order
        if (manifest.dependencies && manifest.dependencies.length > 0) {
          const { DependencyResolver } = await import("@agentos/sdk");
          const resolver = new DependencyResolver(ctx.agentos);
          const resolved = await resolver.resolve(manifest);
          if (resolved.length > 0) {
            if (!opts.json) {
              console.log("Dependency resolution order:");
              for (let i = 0; i < resolved.length; i++) {
                console.log(`  ${i + 1}. ${resolved[i].name}`);
              }
              console.log("");
            }
          }
        }

        // 4. Dry-run: build PTB and print bytes
        if (opts.dryRun) {
          const { Transaction } = await import("@mysten/sui/transactions");
          const transaction = new Transaction();
          const entry = manifest.sui.entry;
          const movePackage = manifest.sui.movePackage;
          const parts = entry.split("::");
          let target: `${string}::${string}::${string}`;
          if (parts.length === 3) {
            target = `${parts[0]}::${parts[1]}::${parts[2]}`;
          } else if (parts.length === 2) {
            target = `${movePackage}::${parts[0]}::${parts[1]}`;
          } else {
            target = `${movePackage}::main::${entry}`;
          }
          transaction.moveCall({ target });
          const result = await formatDryRun(
            transaction,
            ctx.suiClient,
            ctx.config,
            "executeSkill",
          );
          if (opts.json) {
            printJson({
              mode: "dry-run",
              skill: suinsName,
              txBytes: result.txBytes ?? null,
            });
          } else {
            console.log(`Skill: ${suinsName}`);
            console.log(`Target: ${target}`);
            console.log(result.note);
            if (result.txBytes) console.log(result.txBytes);
          }
          return;
        }

        // 5. Execute
        const result = await ctx.agentos.executeSkill({
          signer,
          suinsName,
          params,
        });

        if (opts.json) {
          printJson({
            digest: result.digest,
            effects: result.effects,
          });
        } else {
          console.log(`Skill executed successfully`);
          console.log(`  Digest: ${result.digest}`);
          console.log(`  Effects: ${JSON.stringify(result.effects, null, 2)}`);
        }
      } catch (e) {
        printError(e instanceof Error ? e.message : String(e));
      }
    },
  );

// ─── RESOLVE ──────────────────────────────────────────────────────────────────

skillCommand
  .command("resolve <suinsName>")
  .description("Resolve a skill by SuiNS name and display its metadata")
  .option("--manifest", "Download and print the full SkillManifest JSON")
  .option("--json", "JSON output")
  .action(
    async (suinsName: string, opts: { manifest?: boolean; json?: boolean }) => {
      const ctx = createCliContext();

      try {
        const descriptor = await ctx.agentos.resolveSkill(suinsName);

        if (opts.manifest) {
          const manifest = await ctx.agentos.downloadManifest(
            descriptor.walrusManifestBlob,
            descriptor.manifestHash,
            descriptor.sealPolicyId
              ? { sealPolicyId: descriptor.sealPolicyId }
              : undefined,
          );
          if (opts.json) {
            printJson({ descriptor, manifest });
          } else {
            console.log(`Skill: ${descriptor.skillId}`);
            console.log(`  Blob ID:      ${descriptor.walrusManifestBlob}`);
            console.log(`  Hash:         ${descriptor.manifestHash}`);
            console.log(`  Version:      ${descriptor.version}`);
            console.log(
              `  Dependencies: ${descriptor.dependencies.length > 0 ? descriptor.dependencies.join(", ") : "none"}`,
            );
            if (descriptor.sealPolicyId) {
              console.log(`  Seal Policy:  ${descriptor.sealPolicyId}`);
            }
            console.log("");
            console.log("Manifest:");
            console.log(JSON.stringify(manifest, null, 2));
          }
          return;
        }

        if (opts.json) {
          printJson(descriptor);
        } else {
          console.log(`Skill: ${descriptor.skillId}`);
          console.log(`  Blob ID:      ${descriptor.walrusManifestBlob}`);
          console.log(`  Hash:         ${descriptor.manifestHash}`);
          console.log(`  Version:      ${descriptor.version}`);
          console.log(
            `  Dependencies: ${descriptor.dependencies.length > 0 ? descriptor.dependencies.join(", ") : "none"}`,
          );
          if (descriptor.sealPolicyId) {
            console.log(`  Seal Policy:  ${descriptor.sealPolicyId}`);
          }
        }
      } catch (e) {
        printError(e instanceof Error ? e.message : String(e));
      }
    },
  );

// ─── LIST ─────────────────────────────────────────────────────────────────────

skillCommand
  .command("list <agentName>")
  .description("List skills registered under an agent")
  .option("--json", "JSON output")
  .action((agentName: string, opts: { json?: boolean }) => {
    const ctx = createCliContext();
    const skills = ctx.registry.listSkills(agentName);
    if (!skills.length) {
      const resolved = ctx.registry.resolveAgent(agentName);
      if (!resolved) printError(`Agent not found: ${agentName}`);
    }
    if (opts.json) {
      printJson({ agent: agentName, skills });
    } else {
      for (const s of skills) {
        console.log(
          `${s.mvrPackage}  ${s.version}  [${s.network}]  ${s.status}`,
        );
      }
    }
  });
