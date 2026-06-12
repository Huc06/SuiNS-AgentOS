import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  loadConfig,
  LocalRegistry,
  resolveRegistryPath,
} from "@agentos/sdk/node";

export function getRegistry(): LocalRegistry {
  const cwd = process.cwd();
  const config = loadConfig(cwd);
  const repoRoot = join(cwd, "../..");

  let registryPath: string;
  if (process.env.AGENTOS_REGISTRY_PATH) {
    registryPath = process.env.AGENTOS_REGISTRY_PATH;
  } else if (process.env.VERCEL) {
    // Vercel serverless: filesystem is read-only except /tmp.
    // Use /tmp so the registry can be created/written during the request.
    registryPath = join(tmpdir(), ".agentos", "registry.json");
  } else {
    registryPath = resolveRegistryPath(config, repoRoot);
  }

  return LocalRegistry.open(registryPath);
}
