import { join } from 'node:path';

import { loadConfig, LocalRegistry, resolveRegistryPath } from '@agentos/sdk/node';

export function getRegistry(): LocalRegistry {
  const cwd = process.cwd();
  const config = loadConfig(cwd);
  const repoRoot = join(cwd, '../..');
  const registryPath =
    process.env.AGENTOS_REGISTRY_PATH ?? resolveRegistryPath(config, repoRoot);
  return LocalRegistry.open(registryPath);
}
