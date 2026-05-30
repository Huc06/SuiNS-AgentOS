import type { ClientWithCoreApi } from '@mysten/sui/experimental';
import type { Signer } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import type { TransactionObjectArgument } from '@mysten/sui/transactions';

import * as contracts from './contracts/index.js';
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
}

export class AgentOSClient {
  #client: ClientWithCoreApi;
  #harborApiKey?: string;

  constructor({ client, harborApiKey }: AgentOSClientOptions) {
    this.#client = client;
    this.#harborApiKey = harborApiKey;
  }

  get client(): ClientWithCoreApi {
    return this.#client;
  }

  async resolveAgent(_suinsName: string): Promise<AgentPassport> {
    throw new Error('Not implemented');
  }

  async resolveSkill(_suinsName: string): Promise<SkillDescriptor> {
    throw new Error('Not implemented');
  }

  async listSkills(_agentName: string): Promise<SkillDescriptor[]> {
    throw new Error('Not implemented');
  }

  async downloadManifest(
    _blobId: string,
    _sealPolicyId: string,
  ): Promise<SkillManifest> {
    throw new Error('Not implemented');
  }

  async createAgent(_options: {
    signer: Signer;
    name: string;
    runtimeWallet: string;
    options?: AgentOptions;
  }): Promise<AgentPassport> {
    throw new Error('Not implemented');
  }

  async revokeAgent(_options: { signer: Signer; passportId: string }): Promise<void> {
    throw new Error('Not implemented');
  }

  async publishSkill(_options: {
    signer: Signer;
    manifest: SkillManifest;
    bucketId: string;
  }): Promise<SkillDescriptor> {
    throw new Error('Not implemented');
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
      const passport = transaction.add(contracts.agentPassport.create(options));
      return { transaction, passport };
    },

    revokeAgent: (options: { passport: TransactionObjectArgument }) => {
      const transaction = new Transaction();
      transaction.add(contracts.agentPassport.revoke(options));
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
      const descriptor = transaction.add(contracts.skillDescriptor.create(options));
      return { transaction, descriptor };
    },

    createBucketPolicy: (options: { sealPolicyId: string }) => {
      const transaction = new Transaction();
      const policy = transaction.add(contracts.bucketPolicy.create(options));
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
