import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface AgentOSConfig {
  network: 'testnet' | 'mainnet' | 'devnet';
  rpcUrl?: string;
  packageId?: string;
  registryPath?: string;
  dashboardUrl?: string;
}

const DEFAULT_CONFIG: AgentOSConfig = {
  network: 'testnet',
  dashboardUrl: 'http://localhost:3000',
};

export function loadConfig(cwd = process.cwd()): AgentOSConfig {
  const paths = [
    join(cwd, '.agentos', 'config.json'),
    join(homedir(), '.agentos', 'config.json'),
  ];

  for (const path of paths) {
    if (existsSync(path)) {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<AgentOSConfig>;
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  }

  return { ...DEFAULT_CONFIG };
}

export function resolveRegistryPath(config: AgentOSConfig, cwd = process.cwd()): string {
  if (config.registryPath) return resolve(config.registryPath);
  const local = join(cwd, '.agentos', 'registry.json');
  if (existsSync(local)) return local;
  return join(homedir(), '.agentos', 'registry.json');
}
