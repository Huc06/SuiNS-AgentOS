import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

import {
  loadConfig,
  LocalRegistry,
  resolveRegistryPath,
} from "@agentos/sdk/node";

/**
 * Path to the bundled read-only registry that ships with the build.
 * This file is copied into the frontend package at build time from the
 * repo root `.agentos/registry.json`. On Vercel, we copy it to /tmp
 * on first request so the serverless function always has data.
 */
const BUNDLED_REGISTRY = join(process.cwd(), "registry.seed.json");

function ensureVercelRegistry(targetPath: string): void {
  // If the target already exists (warm instance), nothing to do
  if (existsSync(targetPath)) return;

  // Ensure the directory exists
  mkdirSync(dirname(targetPath), { recursive: true });

  // Copy bundled seed registry to /tmp
  if (existsSync(BUNDLED_REGISTRY)) {
    copyFileSync(BUNDLED_REGISTRY, targetPath);
  } else {
    // Fallback: write minimal empty registry so LocalRegistry.open doesn't crash
    writeFileSync(
      targetPath,
      JSON.stringify({ version: 1, agents: [], skills: [] }, null, 2),
      "utf8",
    );
  }
}

/**
 * Resolve the registry JSON path the same way for every surface (the registry
 * itself + any `AgentOSClient` constructed server-side), so they all read/write
 * the one shared `.agentos/registry.json`.
 */
export function getRegistryPath(): string {
  const cwd = process.cwd();
  const config = loadConfig(cwd);
  const repoRoot = join(cwd, "../..");

  if (process.env.AGENTOS_REGISTRY_PATH) {
    return process.env.AGENTOS_REGISTRY_PATH;
  }
  if (process.env.VERCEL) {
    // Vercel serverless: filesystem is read-only except /tmp.
    // Copy the bundled seed registry to /tmp on first request.
    const registryPath = join(tmpdir(), ".agentos", "registry.json");
    ensureVercelRegistry(registryPath);
    return registryPath;
  }
  return resolveRegistryPath(config, repoRoot);
}

export function getRegistry(): LocalRegistry {
  return LocalRegistry.open(getRegistryPath());
}
