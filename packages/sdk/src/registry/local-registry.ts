import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';

import type { SkillManifest } from '../types.js';
import { normalizeSuinsName, slugFromSuins } from './normalize.js';
import { SEED_REGISTRY } from './seed.js';
import type {
  RegistryAgentRecord,
  RegistryFile,
  RegistrySkillRecord,
  ResolveAgentResponse,
} from './types.js';

export class LocalRegistry {
  #filePath: string;
  #data: RegistryFile;

  constructor(filePath: string, data?: RegistryFile) {
    this.#filePath = filePath;
    this.#data = data ?? LocalRegistry.loadFromDisk(filePath);
  }

  static loadFromDisk(filePath: string): RegistryFile {
    if (!existsSync(filePath)) {
      return structuredClone(SEED_REGISTRY);
    }
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as RegistryFile;
    if (raw.version !== 1) {
      throw new Error(`Unsupported registry version: ${String((raw as { version?: unknown }).version)}`);
    }
    return raw;
  }

  static open(filePath: string): LocalRegistry {
    return new LocalRegistry(filePath);
  }

  get filePath(): string {
    return this.#filePath;
  }

  get snapshot(): RegistryFile {
    return structuredClone(this.#data);
  }

  save(): void {
    mkdirSync(dirname(this.#filePath), { recursive: true });
    writeFileSync(this.#filePath, `${JSON.stringify(this.#data, null, 2)}\n`, 'utf8');
  }

  findAgentBySuins(suinsName: string): RegistryAgentRecord | undefined {
    const normalized = normalizeSuinsName(suinsName);
    return this.#data.agents.find(
      (a) => a.suinsName === normalized || a.slug === normalized.replace(/\.sui$/, ''),
    );
  }

  findAgentBySlug(slug: string): RegistryAgentRecord | undefined {
    return this.#data.agents.find((a) => a.slug === slug);
  }

  resolveAgent(name: string): ResolveAgentResponse | null {
    const agent =
      this.findAgentBySuins(name) ?? this.findAgentBySlug(name.replace(/^@/, ''));
    if (!agent) return null;
    const skills = this.#data.skills.filter((s) => s.agentSlug === agent.slug);
    return { agent, skills };
  }

  listSkills(agentName: string): RegistrySkillRecord[] {
    const resolved = this.resolveAgent(agentName);
    return resolved?.skills ?? [];
  }

  listAgents(): RegistryAgentRecord[] {
    return this.#data.agents.filter((a) => a.status === 'active');
  }

  registerAgent(input: {
    suinsName: string;
    runtimeWallet: string;
    network?: 'mainnet' | 'testnet';
    passportVersion?: string;
  }): RegistryAgentRecord {
    const suinsName = normalizeSuinsName(input.suinsName);
    if (!suinsName.endsWith('.sui')) {
      throw new Error('Invalid SuiNS name — must end with .sui');
    }
    const existing = this.findAgentBySuins(suinsName);
    if (existing) {
      throw new Error(`Agent already registered: ${existing.suinsName}`);
    }

    const slug = slugFromSuins(suinsName);
    const passportId = `0x${randomBytes(20).toString('hex')}`;
    const record: RegistryAgentRecord = {
      slug,
      suinsName,
      passportId,
      runtimeWallet: input.runtimeWallet,
      network: input.network ?? 'testnet',
      passportVersion: input.passportVersion ?? 'Passport v1.0.0',
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    this.#data.agents.push(record);
    this.save();
    return record;
  }

  publishSkill(input: {
    agentName: string;
    manifest: SkillManifest;
    walrusManifestBlob?: string;
    network?: 'mainnet' | 'testnet';
  }): RegistrySkillRecord {
    const resolved = this.resolveAgent(input.agentName);
    if (!resolved) {
      throw new Error(`Agent not found: ${input.agentName}`);
    }

    const manifestJson = JSON.stringify(input.manifest);
    const manifestHash = `0x${createHash('sha256').update(manifestJson).digest('hex').slice(0, 16)}`;
    const walrusManifestBlob =
      input.walrusManifestBlob ?? `walrus://blob/${input.manifest.name}-${input.manifest.version}`;
    const mvrPackage = input.manifest.publisher.startsWith('@')
      ? input.manifest.publisher
      : `@${resolved.agent.slug}/${input.manifest.name}`;

    const record: RegistrySkillRecord = {
      agentSlug: resolved.agent.slug,
      skillId: input.manifest.name,
      name: input.manifest.name,
      mvrPackage,
      version: `v${input.manifest.version}`,
      walrusManifestBlob,
      manifestHash,
      objectId: `0x${randomBytes(20).toString('hex')}`,
      network: input.network ?? resolved.agent.network,
      status: 'active',
      resolutions: '0',
      lastUpdated: 'just now',
      icon: 'token',
    };

    const dup = this.#data.skills.find(
      (s) => s.agentSlug === record.agentSlug && s.skillId === record.skillId,
    );
    if (dup) {
      Object.assign(dup, record);
    } else {
      this.#data.skills.push(record);
    }
    this.save();
    return record;
  }
}

export function passportFromRecord(record: RegistryAgentRecord) {
  return {
    id: record.passportId,
    owner: record.runtimeWallet,
    suinsName: record.suinsName,
    runtimeWallet: record.runtimeWallet,
    policyRoot: '0x0',
    skillRoot: '0x0',
    memoryNamespace: '',
    activityLogPointer: '',
    status: record.status,
  } as const;
}

export function descriptorFromRecord(record: RegistrySkillRecord) {
  return {
    skillId: record.skillId,
    walrusManifestBlob: record.walrusManifestBlob,
    manifestHash: record.manifestHash,
    mvrPackageName: record.mvrPackage,
    version: record.version,
    requiredCapabilities: [],
    dependencies: [],
  };
}
