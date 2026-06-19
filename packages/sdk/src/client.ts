import type { ClientWithCoreApi } from "@mysten/sui/experimental";
import type { Signer } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import type { TransactionObjectArgument } from "@mysten/sui/transactions";

import * as contracts from "./contracts/index.js";
import { DependencyResolver } from "./dependency-resolver.js";
import { HarborClient } from "./harbor.js";
import type { HarborUploadResult } from "./harbor.js";
import { WalrusClient } from "./walrus.js";
import {
  computeManifestHash,
  deserializeManifest,
  serializeManifest,
  validateManifest,
} from "./manifest.js";
import {
  descriptorFromRecord,
  LocalRegistry,
  passportFromRecord,
} from "./registry/index.js";
import { formatSkillSubname } from "./suins-utils.js";
import type {
  AgentOptions,
  AgentPassport,
  Bucket,
  SkillDescriptor,
  SkillManifest,
  SubAgentConfig,
} from "./types.js";

export interface AgentOSClientOptions {
  client: ClientWithCoreApi;
  harborApiKey?: string;
  /** Published Move package id (0x…). Falls back to AGENTOS_PACKAGE_ID env. */
  packageId?: string;
  /** Local registry JSON path (CLI/MCP). Uses in-memory seed when omitted in browser. */
  registryPath?: string;
  /** Harbor space ID for blob uploads. Defaults to HARBOR_SPACE_ID env. */
  spaceId?: string;
  /**
   * Blob storage backend for manifest upload/download.
   * - `"walrus"` (default): public Walrus publisher/aggregator HTTP API. No
   *   API key, Seal handshake, or bucket required.
   * - `"harbor"`: Seal-encrypted Harbor gateway (requires harborApiKey +
   *   spaceId + bucket). Kept for compatibility; opt-in.
   * Defaults to `"harbor"` only when a harborApiKey is supplied, otherwise
   * `"walrus"`.
   */
  storageBackend?: "walrus" | "harbor";
  /** Walrus publisher base URL (write). Defaults to the testnet publisher. */
  walrusPublisherUrl?: string;
  /** Walrus aggregator base URL (read). Defaults to the testnet aggregator. */
  walrusAggregatorUrl?: string;
}

export interface UploadManifestOptions {
  /** Seal policy ID for encrypting the manifest before upload (private skills). */
  sealPolicyId?: string;
}

export interface DownloadManifestOptions {
  /** Seal policy ID for decrypting the manifest after download (private skills). */
  sealPolicyId?: string;
  /** Membership proof for Seal decryption. */
  membershipProof?: unknown;
}

export interface PublishSkillOptions {
  signer: Signer;
  manifest: SkillManifest;
  bucketId: string;
  agentName?: string;
  /** Pre-uploaded Walrus blob ID — skips upload if provided. */
  walrusManifestBlob?: string;
  /** Private skill options. */
  private?: { sealPolicyId: string };
}

export interface ExecuteSkillOptions {
  signer: Signer;
  suinsName: string;
  params?: Record<string, unknown>;
  /** Agent capabilities for policy gate verification. */
  agentCapabilities?: string[];
}

export interface ExecuteSkillResult {
  digest: string;
  effects: unknown;
}

export class AgentOSClient {
  #client: ClientWithCoreApi;
  #harborApiKey?: string;
  #packageId?: string;
  #registry: LocalRegistry | null;
  #spaceId?: string;
  #storageBackend: "walrus" | "harbor";
  #walrusPublisherUrl?: string;
  #walrusAggregatorUrl?: string;

  constructor({
    client,
    harborApiKey,
    packageId,
    registryPath,
    spaceId,
    storageBackend,
    walrusPublisherUrl,
    walrusAggregatorUrl,
  }: AgentOSClientOptions) {
    this.#client = client;
    this.#harborApiKey = harborApiKey;
    this.#packageId = packageId;
    this.#registry = registryPath ? LocalRegistry.open(registryPath) : null;
    this.#spaceId = spaceId ?? process.env.HARBOR_SPACE_ID?.trim();
    // Default to Walrus unless the caller explicitly opts into Harbor (or only
    // supplied a Harbor key, which implies Harbor intent).
    this.#storageBackend =
      storageBackend ?? (harborApiKey ? "harbor" : "walrus");
    this.#walrusPublisherUrl = walrusPublisherUrl;
    this.#walrusAggregatorUrl = walrusAggregatorUrl;
  }

  get registry(): LocalRegistry | null {
    return this.#registry;
  }

  get client(): ClientWithCoreApi {
    return this.#client;
  }

  async resolveAgent(suinsName: string): Promise<AgentPassport> {
    // Try on-chain SuiNS resolution first (works in browser without registryPath)
    try {
      const { resolveAgentByName } = await import("./suins-resolve.js");
      const passport = await resolveAgentByName(this.#client, suinsName);
      if (passport) return passport;
    } catch {
      // Fall through to registry
    }

    // Fallback: local registry
    if (!this.#registry) {
      throw new Error(`Agent not found: ${suinsName}`);
    }
    const resolved = this.#registry.resolveAgent(suinsName);
    if (!resolved) {
      throw new Error(`Agent not found: ${suinsName}`);
    }
    return passportFromRecord(resolved.agent);
  }

  async resolveSkill(
    suinsNameOrSkillId: string,
    agentName?: string,
  ): Promise<SkillDescriptor> {
    // First, attempt on-chain SuiNS resolution if the input looks like a SuiNS name
    if (suinsNameOrSkillId.includes(".")) {
      try {
        return await this.#resolveSkillOnChain(suinsNameOrSkillId);
      } catch {
        // Fall through to local registry lookup
      }
    }

    // Fallback: local registry lookup
    if (!this.#registry) {
      throw new Error(`Skill not found: ${suinsNameOrSkillId}`);
    }
    const skills = agentName
      ? this.#registry.listSkills(agentName)
      : this.#registry.snapshot.skills;
    const record = skills.find(
      (s) =>
        s.skillId === suinsNameOrSkillId ||
        s.mvrPackage === suinsNameOrSkillId ||
        s.suinsName === suinsNameOrSkillId,
    );
    if (!record) {
      throw new Error(`Skill not found: ${suinsNameOrSkillId}`);
    }
    return descriptorFromRecord(record);
  }

  /**
   * Resolve a SuiNS skill subname to a SkillDescriptor by querying the Sui network.
   * Fetches the SuiNS name → object address → SkillDescriptor fields.
   */
  async #resolveSkillOnChain(suinsName: string): Promise<SkillDescriptor> {
    // Resolve SuiNS name to object address using Sui client's resolveNameServiceAddress
    const address = await (
      this.#client as unknown as {
        resolveNameServiceAddress?: (params: {
          name: string;
        }) => Promise<string | null>;
      }
    ).resolveNameServiceAddress?.({ name: suinsName });

    if (!address) {
      throw new Error(`Skill not found: ${suinsName}`);
    }

    // Fetch the SkillDescriptor object fields from on-chain
    const object = await (
      this.#client as unknown as {
        getObject?: (params: {
          id: string;
          options: { showContent: boolean };
        }) => Promise<{
          data?: {
            content?: {
              fields?: Record<string, unknown>;
            };
          };
        }>;
      }
    ).getObject?.({ id: address, options: { showContent: true } });

    const fields = object?.data?.content?.fields;
    if (!fields) {
      throw new Error(`Invalid SkillDescriptor at ${address}`);
    }

    // Validate and map fields into the SkillDescriptor interface
    return this.#parseDescriptorFields(fields, address);
  }

  /**
   * Parse raw on-chain SkillDescriptor fields into the SDK SkillDescriptor interface.
   */
  #parseDescriptorFields(
    fields: Record<string, unknown>,
    address: string,
  ): SkillDescriptor {
    const decode = (value: unknown): string => {
      if (Array.isArray(value)) {
        return new TextDecoder().decode(new Uint8Array(value as number[]));
      }
      if (typeof value === "string") return value;
      return "";
    };

    const decodeArray = (value: unknown): string[] => {
      if (!Array.isArray(value)) return [];
      return (value as unknown[]).map(decode);
    };

    const skillId = decode(fields.skill_id);
    const walrusManifestBlob = decode(fields.walrus_manifest_blob);
    const manifestHash = decode(fields.manifest_hash);
    const mvrPackageName = decode(fields.mvr_package_name);
    const version = decode(fields.version);
    const requiredCapabilities = decodeArray(fields.required_capabilities);
    const dependencies = decodeArray(fields.dependencies);
    const sealPolicyId = decode(fields.seal_policy_id);

    if (!skillId || !walrusManifestBlob || !manifestHash) {
      throw new Error(`Invalid SkillDescriptor at ${address}`);
    }

    return {
      skillId,
      walrusManifestBlob,
      manifestHash,
      mvrPackageName,
      version,
      requiredCapabilities,
      dependencies,
      // A non-empty seal_policy_id means the manifest is Seal-encrypted and a
      // sui-groups membership proof is required to decrypt it (see Task 19).
      ...(sealPolicyId ? { sealPolicyId, decryptionRequired: true } : {}),
    };
  }

  async listSkills(agentName: string): Promise<SkillDescriptor[]> {
    if (!this.#registry) {
      throw new Error("Not implemented: set registryPath");
    }
    return this.#registry.listSkills(agentName).map(descriptorFromRecord);
  }

  async downloadManifest(
    blobId: string,
    expectedHash: string,
    options?: DownloadManifestOptions,
  ): Promise<SkillManifest> {
    // 1. Download blob from the configured storage backend.
    let content: Uint8Array;
    if (this.#storageBackend === "harbor") {
      const apiKey = this.#harborApiKey ?? HarborClient.getApiKey();
      const harbor = new HarborClient({ apiKey });
      content = await harbor.downloadBlob(blobId);
    } else {
      const walrus = new WalrusClient({
        publisherUrl: this.#walrusPublisherUrl,
        aggregatorUrl: this.#walrusAggregatorUrl,
      });
      content = await walrus.downloadBlob(blobId);
    }

    // 2. Optionally Seal-decrypt for private skills
    if (options?.sealPolicyId) {
      const { sealDecrypt } = await import("./seal.js");
      content = await sealDecrypt(
        content,
        options.sealPolicyId,
        options.membershipProof,
      );
    }

    // 3. Compute SHA-256 hash and verify against expected
    const actualHash = computeManifestHash(content);
    if (actualHash !== expectedHash) {
      throw new Error(
        `Manifest integrity check failed: expected ${expectedHash}, got ${actualHash}`,
      );
    }

    // 4. Deserialize and return
    return deserializeManifest(content);
  }

  async createAgent(options: {
    signer: Signer;
    name: string;
    runtimeWallet: string;
    options?: AgentOptions;
  }): Promise<AgentPassport> {
    if (!this.#registry) {
      throw new Error("Not implemented: set registryPath");
    }
    const record = this.#registry.registerAgent({
      suinsName: options.name,
      runtimeWallet: options.runtimeWallet,
      network: options.options?.network === "mainnet" ? "mainnet" : "testnet",
    });
    void options.signer;
    return passportFromRecord(record);
  }

  async revokeAgent(_options: {
    signer: Signer;
    passportId: string;
  }): Promise<void> {
    throw new Error("Not implemented");
  }

  async publishSkill(options: PublishSkillOptions): Promise<SkillDescriptor> {
    const {
      signer,
      manifest,
      bucketId,
      walrusManifestBlob: providedBlobId,
    } = options;
    const agentName = options.agentName ?? manifest.publisher;
    const sealPolicyId = options.private?.sealPolicyId;

    // 1. Validate the manifest
    validateManifest(manifest);

    // 2. Upload manifest to Walrus (or use provided blobId)
    let blobId: string;
    let manifestHash: string;
    if (providedBlobId) {
      blobId = providedBlobId;
      const serialized = serializeManifest(manifest);
      manifestHash = computeManifestHash(serialized);
    } else {
      const uploadResult = await this.uploadManifest(bucketId, manifest, {
        sealPolicyId,
      });
      blobId = uploadResult.blobId;
      manifestHash = uploadResult.manifestHash;
    }

    // 3. Determine whether this is a create or update
    const existingRecord = this.#registry
      ? this.#registry.snapshot.skills.find(
          (s) =>
            s.skillId === manifest.name &&
            s.agentSlug === this.#registry!.findAgentBySuins(agentName)?.slug,
        )
      : null;

    // 4. Build PTB
    const transaction = new Transaction();
    let descriptorObjectId: string | undefined;

    if (existingRecord?.objectId) {
      // Update existing SkillDescriptor
      descriptorObjectId = existingRecord.objectId;
      transaction.add(
        contracts.skillDescriptor.update({
          descriptor: transaction.object(existingRecord.objectId),
          walrusManifestBlob: blobId,
          manifestHash,
          version: manifest.version,
          packageId: this.#packageId,
        }),
      );

      // Set seal policy if private
      if (sealPolicyId) {
        transaction.add(
          contracts.skillDescriptor.setSealPolicy({
            descriptor: transaction.object(existingRecord.objectId),
            sealPolicyId,
            packageId: this.#packageId,
          }),
        );
      }

      // Update dependencies
      if (manifest.dependencies.length > 0) {
        transaction.add(
          contracts.skillDescriptor.setDependencies({
            descriptor: transaction.object(existingRecord.objectId),
            dependencies: manifest.dependencies,
            packageId: this.#packageId,
          }),
        );
      }
    } else {
      // Create new SkillDescriptor
      const mvrPackageName = manifest.publisher.startsWith("@")
        ? manifest.publisher
        : `@${agentName.replace(/\.sui$/, "")}/${manifest.name}`;

      const descriptor = transaction.add(
        contracts.skillDescriptor.create({
          skillId: manifest.name,
          walrusManifestBlob: blobId,
          manifestHash,
          mvrPackageName,
          version: manifest.version,
          packageId: this.#packageId,
        }),
      );

      // Set seal policy if private
      if (sealPolicyId) {
        transaction.add(
          contracts.skillDescriptor.setSealPolicy({
            descriptor,
            sealPolicyId,
            packageId: this.#packageId,
          }),
        );
      }

      // Set dependencies
      if (manifest.dependencies.length > 0) {
        transaction.add(
          contracts.skillDescriptor.setDependencies({
            descriptor,
            dependencies: manifest.dependencies,
            packageId: this.#packageId,
          }),
        );
      }

      // Transfer to signer
      const signerAddress = signer.toSuiAddress();
      transaction.transferObjects([descriptor], signerAddress);
    }

    // 5. Execute PTB
    try {
      const signerAddress = signer.toSuiAddress();
      transaction.setSender(signerAddress);

      const txBytes = await transaction.build({
        client: this.#client as never,
      });
      const { signature } = await signer.signTransaction(txBytes);

      const result = await (
        this.#client as unknown as {
          executeTransactionBlock?: (params: {
            transactionBlock: Uint8Array;
            signature: string;
            options: { showEffects: boolean; showObjectChanges: boolean };
          }) => Promise<{
            digest: string;
            effects?: { status?: { status: string; error?: string } };
            objectChanges?: Array<{
              type: string;
              objectId: string;
              objectType?: string;
            }>;
          }>;
        }
      ).executeTransactionBlock?.({
        transactionBlock: txBytes,
        signature,
        options: { showEffects: true, showObjectChanges: true },
      });

      if (result?.effects?.status?.status === "failure") {
        throw new Error(
          `On-chain registration failed: ${result.effects.status.error ?? "transaction failed"}`,
        );
      }

      // Extract created object ID from result if available
      if (!descriptorObjectId && result?.objectChanges) {
        const created = result.objectChanges.find(
          (c) =>
            c.type === "created" &&
            c.objectType?.includes("skill_descriptor::SkillDescriptor"),
        );
        if (created) {
          descriptorObjectId = created.objectId;
        }
      }
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.startsWith("On-chain registration failed:")
      ) {
        throw err;
      }
      // If execution methods are not available (e.g., in test/local mode),
      // we proceed with local registry update only
    }

    // 6. Create SuiNS subname (task 7.6)
    const suinsName = formatSkillSubname(manifest.name, agentName);
    // SuiNS subname creation is best-effort; it's handled in the PTB
    // or via a separate transaction in future full implementation.
    // For now we track it in the registry.

    // 7. Update local registry
    if (this.#registry) {
      this.#registry.publishSkill({
        agentName,
        manifest,
        walrusManifestBlob: blobId,
        manifestHash,
        objectId: descriptorObjectId,
        suinsName,
        sealPolicyId,
      });
    }

    return {
      skillId: manifest.name,
      walrusManifestBlob: blobId,
      manifestHash,
      mvrPackageName: manifest.publisher.startsWith("@")
        ? manifest.publisher
        : `@${agentName.replace(/\.sui$/, "")}/${manifest.name}`,
      version: manifest.version,
      requiredCapabilities: manifest.sui.policyRequired ?? [],
      dependencies: manifest.dependencies ?? [],
      ...(sealPolicyId ? { sealPolicyId, decryptionRequired: true } : {}),
    };
  }

  /**
   * Build an unsigned Transaction for skill execution (browser-safe).
   * Does NOT require a Signer — returns the transaction for dapp-kit to sign.
   *
   * Steps: resolve skill → download manifest → verify hash → check capabilities → build PTB.
   */
  async buildExecuteSkillTx(options: {
    suinsName: string;
    params?: Record<string, unknown>;
    agentCapabilities?: string[];
  }): Promise<{
    descriptor: SkillDescriptor;
    manifest: SkillManifest;
    transaction: Transaction;
    manifestHash: string;
    verified: boolean;
  }> {
    const { suinsName, params, agentCapabilities } = options;

    // 1. Resolve skill by SuiNS name
    const descriptor = await this.resolveSkill(suinsName);

    // 2. Download manifest from Walrus
    let manifest: SkillManifest;
    let verified = true;
    try {
      manifest = await this.downloadManifest(
        descriptor.walrusManifestBlob,
        descriptor.manifestHash,
        descriptor.sealPolicyId
          ? { sealPolicyId: descriptor.sealPolicyId }
          : undefined,
      );
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes("integrity check failed")
      ) {
        verified = false;
        throw err;
      }
      throw err;
    }

    // 3. Resolve dependencies (if any)
    if (manifest.dependencies && manifest.dependencies.length > 0) {
      const depResolver = new DependencyResolver(this);
      await depResolver.resolve(manifest);
    }

    // 4. Verify agent has required capabilities
    const requiredPolicies = manifest.sui.policyRequired ?? [];
    if (requiredPolicies.length > 0) {
      const capabilities = agentCapabilities ?? [];
      for (const required of requiredPolicies) {
        if (!capabilities.includes(required)) {
          throw new Error(`Missing required capability: ${required}`);
        }
      }
    }

    // 5. Build PTB from manifest's sui.movePackage + sui.entry
    const transaction = new Transaction();
    const [packageAddr, module, func] = this.#parseEntry(
      manifest.sui.movePackage,
      manifest.sui.entry,
    );

    const moveCallArgs: TransactionObjectArgument[] = [];
    if (params) {
      for (const value of Object.values(params)) {
        if (typeof value === "string") {
          moveCallArgs.push(
            transaction.pure.string(
              value,
            ) as unknown as TransactionObjectArgument,
          );
        } else if (typeof value === "number") {
          moveCallArgs.push(
            transaction.pure.u64(value) as unknown as TransactionObjectArgument,
          );
        } else if (typeof value === "boolean") {
          moveCallArgs.push(
            transaction.pure.bool(
              value,
            ) as unknown as TransactionObjectArgument,
          );
        }
      }
    }

    transaction.moveCall({
      target: `${packageAddr}::${module}::${func}`,
      arguments: moveCallArgs,
    });

    return {
      descriptor,
      manifest,
      transaction,
      manifestHash: descriptor.manifestHash,
      verified,
    };
  }

  async executeSkill(
    options: ExecuteSkillOptions,
  ): Promise<ExecuteSkillResult> {
    const { signer, suinsName, params, agentCapabilities } = options;

    // 1. Resolve skill by SuiNS name
    const descriptor = await this.resolveSkill(suinsName);

    // 2. Download manifest from Walrus
    const manifest = await this.downloadManifest(
      descriptor.walrusManifestBlob,
      descriptor.manifestHash,
      descriptor.sealPolicyId
        ? { sealPolicyId: descriptor.sealPolicyId }
        : undefined,
    );

    // 3. Resolve dependencies (if any)
    if (manifest.dependencies && manifest.dependencies.length > 0) {
      const depResolver = new DependencyResolver(this);
      await depResolver.resolve(manifest);
    }

    // 4. Verify agent has required capabilities
    const requiredPolicies = manifest.sui.policyRequired ?? [];
    if (requiredPolicies.length > 0) {
      const capabilities = agentCapabilities ?? [];
      for (const required of requiredPolicies) {
        if (!capabilities.includes(required)) {
          throw new Error(`Missing required capability: ${required}`);
        }
      }
    }

    // 5. Build PTB from manifest's sui.movePackage + sui.entry
    const transaction = new Transaction();
    const [packageAddr, module, func] = this.#parseEntry(
      manifest.sui.movePackage,
      manifest.sui.entry,
    );

    // Build arguments from params if provided
    const moveCallArgs: TransactionObjectArgument[] = [];
    if (params) {
      for (const value of Object.values(params)) {
        if (typeof value === "string") {
          moveCallArgs.push(
            transaction.pure.string(
              value,
            ) as unknown as TransactionObjectArgument,
          );
        } else if (typeof value === "number") {
          moveCallArgs.push(
            transaction.pure.u64(value) as unknown as TransactionObjectArgument,
          );
        } else if (typeof value === "boolean") {
          moveCallArgs.push(
            transaction.pure.bool(
              value,
            ) as unknown as TransactionObjectArgument,
          );
        }
      }
    }

    transaction.moveCall({
      target: `${packageAddr}::${module}::${func}`,
      arguments: moveCallArgs,
    });

    // 6. Execute PTB
    const signerAddress = signer.toSuiAddress();
    transaction.setSender(signerAddress);

    const txBytes = await transaction.build({ client: this.#client as never });
    const { signature } = await signer.signTransaction(txBytes);

    const result = await (
      this.#client as unknown as {
        executeTransactionBlock?: (params: {
          transactionBlock: Uint8Array;
          signature: string;
          options: { showEffects: boolean };
        }) => Promise<{
          digest: string;
          effects?: unknown;
        }>;
      }
    ).executeTransactionBlock?.({
      transactionBlock: txBytes,
      signature,
      options: { showEffects: true },
    });

    if (!result) {
      throw new Error("Transaction execution not available on this client");
    }

    return {
      digest: result.digest,
      effects: result.effects,
    };
  }

  /**
   * Parse a manifest's movePackage and entry into [packageAddress, module, function].
   * Supports formats like:
   *   movePackage: "0xabc123"
   *   entry: "module_name::function_name"
   * Or combined format:
   *   entry: "0xabc123::module_name::function_name"
   */
  #parseEntry(movePackage: string, entry: string): [string, string, string] {
    // If entry contains full target (package::module::function)
    const parts = entry.split("::");
    if (parts.length === 3) {
      return [parts[0], parts[1], parts[2]];
    }
    if (parts.length === 2) {
      return [movePackage, parts[0], parts[1]];
    }
    // Assume entry is just function name; module defaults to skill name
    return [movePackage, "main", entry];
  }

  /**
   * Delegate capabilities from a parent agent to a sub-agent.
   * Builds a PTB targeting `agentos::delegation::grant`. Falls back to
   * local registry persistence when the on-chain path is unavailable.
   */
  async delegateSubAgent(options: {
    signer: Signer;
    parent: string;
    child: SubAgentConfig;
  }): Promise<{
    digest?: string;
    capId?: string;
    registryFallback: boolean;
  }> {
    const { signer, parent, child } = options;

    // Build the delegation transaction
    const transaction = new Transaction();
    const signerAddress = signer.toSuiAddress();
    transaction.setSender(signerAddress);

    // Resolve the parent passport object ID
    let parentPassportId: string | undefined;
    if (this.#registry) {
      const resolved = this.#registry.resolveAgent(parent);
      parentPassportId = resolved?.agent.passportId;
    }

    let digest: string | undefined;
    let capId: string | undefined;

    if (parentPassportId && this.#packageId) {
      // Build the on-chain delegation grant
      const cap = transaction.add(
        contracts.delegation.grant({
          parentPassport: transaction.object(parentPassportId),
          childAgent: child.name.includes("0x") ? child.name : signerAddress, // Use child address or fallback
          allowedSkills: [],
          allowedCapabilities: child.permissions,
          spendLimit: child.budget,
          expiryMs: BigInt(child.expiry),
          packageId: this.#packageId,
        }),
      );

      // Transfer the cap to the child agent
      const childAddr = child.name.includes("0x") ? child.name : signerAddress;
      transaction.transferObjects([cap], childAddr);

      try {
        const txBytes = await transaction.build({
          client: this.#client as never,
        });
        const { signature } = await signer.signTransaction(txBytes);

        const result = await (
          this.#client as unknown as {
            executeTransactionBlock?: (params: {
              transactionBlock: Uint8Array;
              signature: string;
              options: { showEffects: boolean; showObjectChanges: boolean };
            }) => Promise<{
              digest: string;
              effects?: { status?: { status: string } };
              objectChanges?: Array<{
                type: string;
                objectId: string;
                objectType?: string;
              }>;
            }>;
          }
        ).executeTransactionBlock?.({
          transactionBlock: txBytes,
          signature,
          options: { showEffects: true, showObjectChanges: true },
        });

        if (result) {
          digest = result.digest;
          const created = result.objectChanges?.find(
            (c) =>
              c.type === "created" &&
              c.objectType?.includes("delegation::DelegationCap"),
          );
          if (created) capId = created.objectId;
        }
      } catch (err) {
        // On-chain failed — will persist to registry below as fallback
        console.warn(
          "On-chain delegation failed, falling back to registry:",
          err,
        );
      }
    }

    // Persist to local registry as fallback (or primary when no packageId)
    const registryFallback = !digest;
    if (this.#registry) {
      this.#registry.addDelegation(parent, {
        childAgent: child.name.includes("0x") ? child.name : "",
        childName: child.name,
        allowedSkills: [],
        allowedCapabilities: child.permissions,
        spendLimit: child.budget.toString(),
        spent: "0",
        expiryMs: child.expiry.toString(),
        revoked: false,
        capId,
        createdAt: new Date().toISOString(),
      });
    }

    return { digest, capId, registryFallback };
  }

  async createSkillBucket(_apiKey?: string): Promise<Bucket> {
    void this.#harborApiKey;
    void _apiKey;
    throw new Error("Not implemented");
  }

  async uploadManifest(
    bucketId: string,
    manifest: SkillManifest,
    options?: UploadManifestOptions,
  ): Promise<HarborUploadResult> {
    // 1. Validate the manifest conforms to sui-agent-skill/v1 schema
    validateManifest(manifest);

    // 2. Serialize deterministically (sorted keys → stable hash)
    const serialized = serializeManifest(manifest);

    // 3. Compute SHA-256 hash of the serialized bytes
    const manifestHash = computeManifestHash(serialized);

    // 4. Optionally Seal-encrypt for private skills
    let content = serialized;
    if (options?.sealPolicyId) {
      // Seal encryption is handled by the seal module (Task 19).
      // For now, import dynamically so this code compiles before the seal
      // module exists. The seal module will export `sealEncrypt`.
      const { sealEncrypt } = await import("./seal.js");
      content = await sealEncrypt(content, options.sealPolicyId);
    }

    // 5. Upload via the configured storage backend.
    let blobId: string;
    if (this.#storageBackend === "harbor") {
      // Harbor (Seal-encrypted gateway) — opt-in. Requires API key + space.
      const apiKey = this.#harborApiKey ?? HarborClient.getApiKey();
      const spaceId = this.#spaceId;
      if (!spaceId) {
        throw new Error(
          "Harbor space ID not configured. Set HARBOR_SPACE_ID or pass spaceId in client options.",
        );
      }
      const harbor = new HarborClient({ apiKey });
      const uploaded = await harbor.uploadBlob(
        spaceId,
        bucketId,
        content,
        `${manifest.name}-${manifest.version}.json`,
      );
      blobId = uploaded.blobId;
    } else {
      // Walrus public publisher (default) — no API key / bucket / Seal needed.
      const walrus = new WalrusClient({
        publisherUrl: this.#walrusPublisherUrl,
        aggregatorUrl: this.#walrusAggregatorUrl,
      });
      const uploaded = await walrus.uploadBlob(content);
      blobId = uploaded.blobId;
    }

    // 6. Return blobId + hash
    return { blobId, manifestHash };
  }

  tx = {
    createAgent: (options: {
      suinsName: string;
      runtimeWallet: string;
      recipient?: string;
    }) => {
      const transaction = new Transaction();
      const recipient = options.recipient ?? options.runtimeWallet;
      transaction.setSender(recipient);
      const passport = transaction.add(
        contracts.agentPassport.create({
          ...options,
          packageId: this.#packageId,
        }),
      );
      transaction.transferObjects([passport], recipient);
      return { transaction, passport };
    },

    revokeAgent: (options: { passport: TransactionObjectArgument }) => {
      const transaction = new Transaction();
      transaction.add(
        contracts.agentPassport.revoke({
          ...options,
          packageId: this.#packageId,
        }),
      );
      return transaction;
    },

    createSkillDescriptor: (options: {
      skillId: string;
      walrusManifestBlob: string;
      manifestHash: string;
      mvrPackageName: string;
      version: string;
    }) => {
      const transaction = new Transaction();
      const descriptor = transaction.add(
        contracts.skillDescriptor.create({
          ...options,
          packageId: this.#packageId,
        }),
      );
      return { transaction, descriptor };
    },

    updateSkillDescriptor: (options: {
      descriptor: TransactionObjectArgument;
      walrusManifestBlob: string;
      manifestHash: string;
      version: string;
    }) => {
      const transaction = new Transaction();
      transaction.add(
        contracts.skillDescriptor.update({
          ...options,
          packageId: this.#packageId,
        }),
      );
      return { transaction };
    },

    createBucketPolicy: (options: { sealPolicyId: string }) => {
      const transaction = new Transaction();
      const policy = transaction.add(
        contracts.bucketPolicy.create({
          ...options,
          packageId: this.#packageId,
        }),
      );
      return { transaction, policy };
    },

    delegateSubAgent: (options: {
      parentPassport: TransactionObjectArgument;
      childAgent: string;
      allowedSkills: string[];
      allowedCapabilities: string[];
      spendLimit: bigint;
      expiryMs: bigint;
    }) => {
      const transaction = new Transaction();
      const cap = transaction.add(
        contracts.delegation.grant({
          ...options,
          packageId: this.#packageId,
        }),
      );
      return { transaction, cap };
    },

    revokeDelegation: (options: { cap: TransactionObjectArgument }) => {
      const transaction = new Transaction();
      transaction.add(
        contracts.delegation.revoke({
          ...options,
          packageId: this.#packageId,
        }),
      );
      return { transaction };
    },
  };

  call = {
    createAgent: contracts.agentPassport.create,
    revokeAgent: contracts.agentPassport.revoke,
    createSkillDescriptor: contracts.skillDescriptor.create,
    updateSkillDescriptor: contracts.skillDescriptor.update,
    setSealPolicy: contracts.skillDescriptor.setSealPolicy,
    setDependencies: contracts.skillDescriptor.setDependencies,
    createBucketPolicy: contracts.bucketPolicy.create,
    sealApprove: contracts.bucketPolicy.sealApprove,
  };

  view = {
    /** Check if an on-chain AgentPassport is active by reading its fields. */
    isAgentActive: async (passportId: string): Promise<boolean> => {
      const c = this.#client as unknown as {
        getObject?: (params: {
          id: string;
          options: { showContent: boolean };
        }) => Promise<{
          data?: { content?: { fields?: Record<string, unknown> } };
        }>;
      };
      if (!c.getObject) {
        // Fallback to registry
        if (this.#registry) {
          const agents = this.#registry.listAgents();
          const agent = agents.find((a) => a.passportId === passportId);
          return agent?.status === "active";
        }
        throw new Error("Cannot read on-chain state: no getObject available");
      }
      const obj = await c.getObject({
        id: passportId,
        options: { showContent: true },
      });
      const fields = obj?.data?.content?.fields;
      if (!fields) throw new Error(`Passport not found: ${passportId}`);
      return Boolean(fields.is_active);
    },
  };

  /**
   * Get reputation data for an agent (exec_count, computed score, active status).
   * Resolves by name or passport ID. Gracefully falls back to registry data
   * when the on-chain passport doesn't have the reputation fields (pre-upgrade).
   */
  async getAgentReputation(nameOrPassportId: string): Promise<{
    execCount: number;
    score: number;
    attestations: number;
    isActive: boolean;
  }> {
    // Try on-chain first
    const c = this.#client as unknown as {
      getObject?: (params: {
        id: string;
        options: { showContent: boolean };
      }) => Promise<{
        data?: { content?: { fields?: Record<string, unknown> } };
      }>;
    };

    let passportId = nameOrPassportId;

    // If it's a name, resolve to passport ID
    if (!nameOrPassportId.startsWith("0x")) {
      try {
        const passport = await this.resolveAgent(nameOrPassportId);
        passportId = passport.id;
      } catch {
        // Return zeros if we can't resolve
        return { execCount: 0, score: 0, attestations: 0, isActive: false };
      }
    }

    if (c.getObject) {
      try {
        const obj = await c.getObject({
          id: passportId,
          options: { showContent: true },
        });
        const fields = obj?.data?.content?.fields;
        if (fields) {
          const execCount =
            typeof fields.exec_count === "number"
              ? fields.exec_count
              : typeof fields.exec_count === "string"
                ? parseInt(fields.exec_count, 10)
                : 0;
          const isActive = Boolean(fields.is_active);

          // v0 heuristic score: based on exec_count + active status
          // TODO: Replace with on-chain AgentPassport reputation field once
          // the contracts attestation module (issue #55) is deployed and indexed.
          const score = Math.min(
            100,
            Math.floor(execCount * 5 + (isActive ? 20 : 0)),
          );

          return {
            execCount,
            score,
            attestations: 0, // Will be populated when attestation indexer is available
            isActive,
          };
        }
      } catch {
        // Fall through to registry
      }
    }

    // Fallback to registry data
    if (this.#registry) {
      const agents = this.#registry.listAgents();
      const agent = agents.find(
        (a) =>
          a.passportId === passportId ||
          a.suinsName === nameOrPassportId ||
          a.slug === nameOrPassportId,
      );
      if (agent) {
        return {
          execCount: 0,
          score: agent.status === "active" ? 20 : 0,
          attestations: 0,
          isActive: agent.status === "active",
        };
      }
    }

    return { execCount: 0, score: 0, attestations: 0, isActive: false };
  }
}
