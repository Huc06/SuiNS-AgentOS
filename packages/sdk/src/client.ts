import type { ClientWithCoreApi } from '@mysten/sui/experimental';
import type { Signer } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import type { TransactionObjectArgument } from '@mysten/sui/transactions';

import * as contracts from './contracts/index.js';
import {
  descriptorFromRecord,
  LocalRegistry,
  passportFromRecord,
} from './registry/index.js';
import type {
  AgentOptions,
  AgentPassport,
  Bucket,
  SkillDescriptor,
  SkillManifest,
  SubAgentConfig,
} from './types.js';

export interface AgentOSClientOptions {
  client: ClientWithCoreApi;
  harborApiKey?: string;
  /** Published Move package id (0x…). Falls back to AGENTOS_PACKAGE_ID env. */
  packageId?: string;
  /** Local registry JSON path (CLI/MCP). Uses in-memory seed when omitted in browser. */
  registryPath?: string;
}

export class AgentOSClient {
  #client: ClientWithCoreApi;
  #harborApiKey?: string;
  #packageId?: string;
  #registry: LocalRegistry | null;

  constructor({ client, harborApiKey, packageId, registryPath }: AgentOSClientOptions) {
    this.#client = client;
    this.#harborApiKey = harborApiKey;
    this.#packageId = packageId;
    this.#registry = registryPath ? LocalRegistry.open(registryPath) : null;
  }

  get registry(): LocalRegistry | null {
    return this.#registry;
  }

  get client(): ClientWithCoreApi {
    return this.#client;
  }

  async resolveAgent(suinsName: string): Promise<AgentPassport> {
    if (!this.#registry) {
      throw new Error('Not implemented: set registryPath or use LocalRegistry in Node');
    }
    const resolved = this.#registry.resolveAgent(suinsName);
    if (!resolved) {
      throw new Error(`Agent not found: ${suinsName}`);
    }
    return passportFromRecord(resolved.agent);
  }

  async resolveSkill(skillId: string, agentName?: string): Promise<SkillDescriptor> {
    if (!this.#registry) {
      throw new Error('Not implemented: set registryPath');
    }
    const skills = agentName
      ? this.#registry.listSkills(agentName)
      : this.#registry.snapshot.skills;
    const record = skills.find((s) => s.skillId === skillId || s.mvrPackage === skillId);
    if (!record) {
      throw new Error(`Skill not found: ${skillId}`);
    }
    return descriptorFromRecord(record);
  }

  async listSkills(agentName: string): Promise<SkillDescriptor[]> {
    if (!this.#registry) {
      throw new Error('Not implemented: set registryPath');
    }
    return this.#registry.listSkills(agentName).map(descriptorFromRecord);
  }

  async downloadManifest(
    _blobId: string,
    _sealPolicyId: string,
  ): Promise<SkillManifest> {
    throw new Error('Not implemented');
  }

  async createAgent(options: {
    signer: Signer;
    name: string;
    runtimeWallet: string;
    options?: AgentOptions;
  }): Promise<AgentPassport> {
    if (!this.#registry) {
      throw new Error('Not implemented: set registryPath');
    }
    const record = this.#registry.registerAgent({
      suinsName: options.name,
      runtimeWallet: options.runtimeWallet,
      network: options.options?.network === 'mainnet' ? 'mainnet' : 'testnet',
    });
    void options.signer;
    return passportFromRecord(record);
  }

  async revokeAgent(_options: { signer: Signer; passportId: string }): Promise<void> {
    throw new Error('Not implemented');
  }

  async publishSkill(options: {
    signer: Signer;
    manifest: SkillManifest;
    bucketId: string;
    agentName?: string;
    walrusManifestBlob?: string;
  }): Promise<SkillDescriptor> {
    if (!this.#registry) {
      throw new Error('Not implemented: set registryPath');
    }
    const agentName = options.agentName ?? options.manifest.publisher;
    const record = this.#registry.publishSkill({
      agentName,
      manifest: options.manifest,
      walrusManifestBlob: options.walrusManifestBlob,
    });
    void options.signer;
    void options.bucketId;
    return descriptorFromRecord(record);
  }

  async delegateSubAgent(_options: {
    signer: Signer;
    parent: string;
    child: SubAgentConfig;
  }): Promise<AgentPassport> {
    throw new Error('Not implemented');
  }

  async createSkillBucket(_apiKey?: string): Promise<Bucket> {
    void this.#harborApiKey;
    void _apiKey;
    throw new Error('Not implemented');
  }

  async uploadManifest(
    _bucketId: string,
    _manifest: SkillManifest,
  ): Promise<string> {
    throw new Error('Not implemented');
  }

  tx = {
    createAgent: (options: { suinsName: string; runtimeWallet: string }) => {
      const transaction = new Transaction();
      const passport = transaction.add(
        contracts.agentPassport.create({ ...options, packageId: this.#packageId }),
      );
      return { transaction, passport };
    },

    revokeAgent: (options: { passport: TransactionObjectArgument }) => {
      const transaction = new Transaction();
      transaction.add(contracts.agentPassport.revoke({ ...options, packageId: this.#packageId }));
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
        contracts.skillDescriptor.create({ ...options, packageId: this.#packageId }),
      );
      return { transaction, descriptor };
    },

    createBucketPolicy: (options: { sealPolicyId: string }) => {
      const transaction = new Transaction();
      const policy = transaction.add(
        contracts.bucketPolicy.create({ ...options, packageId: this.#packageId }),
      );
      return { transaction, policy };
    },
  };

  call = {
    createAgent: contracts.agentPassport.create,
    revokeAgent: contracts.agentPassport.revoke,
    createSkillDescriptor: contracts.skillDescriptor.create,
    createBucketPolicy: contracts.bucketPolicy.create,
    sealApprove: contracts.bucketPolicy.sealApprove,
  };

  view = {
    isAgentActive: async (_passportId: string): Promise<boolean> => {
      throw new Error('Not implemented');
    },
  };
}
