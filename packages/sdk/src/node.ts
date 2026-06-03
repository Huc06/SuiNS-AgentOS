/** Node-only entry (registry, config) — avoids pulling React hooks in CLI/MCP/API routes. */
export { loadConfig, resolveRegistryPath } from './config.js';
export type { AgentOSConfig } from './config.js';
export * from './registry/index.js';
