/** Node-only entry (registry, config) — avoids pulling React hooks in CLI/MCP/API routes. */
export { loadConfig, resolvePackageId, resolveRegistryPath } from "./config.js";
export type { AgentOSConfig } from "./config.js";
export * from "./registry/index.js";
export { scanSkillsDirectory } from "./skill-md-scanner.js";
export {
  parseSuiperpowerOutput,
  detectSuperpowerProject,
  buildManifestFromSuperpowerOutput,
} from "./suiperpower.js";
export type { SuiperpowerBuildResult } from "./suiperpower.js";
