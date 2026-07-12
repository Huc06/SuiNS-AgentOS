/** Node-only entry (registry, config) — avoids pulling React hooks in CLI/MCP/API routes. */
export { loadConfig, resolvePackageId, resolveRegistryPath } from "./config.js";
export type { AgentOSConfig } from "./config.js";
export { AgentOSClient } from "./client.js";
export { agentOS } from "./agentos.js";
export type { AgentOSOptions } from "./agentos.js";
export type {
  AgentOSClientOptions,
  BuildExecuteSkillTxOptions,
  DownloadManifestOptions,
  ExecuteSkillOptions,
  ExecuteSkillResult,
  PublishSkillOptions,
  UploadManifestOptions,
} from "./client.js";
export type {
  AgentPassport,
  SkillDescriptor,
  SubAgentConfig,
} from "./types.js";
export * from "./registry/index.js";
export * from "./storage/index.js";
export * as contracts from "./contracts/index.js";
export { HarborClient } from "./harbor.js";
export type { HarborClientOptions, HarborUploadResult } from "./harbor.js";
export {
  DEFAULT_WALRUS_AGGREGATOR,
  DEFAULT_WALRUS_EPOCHS,
  DEFAULT_WALRUS_PUBLISHER,
  WalrusClient,
} from "./walrus.js";
export type { WalrusClientOptions, WalrusUploadOptions } from "./walrus.js";
export {
  MemwalClient,
  memwalFromEnv,
  DEFAULT_MEMWAL_RELAYER_URL,
} from "./memwal.js";
export type { MemwalClientOptions } from "./memwal.js";
export {
  serializeManifest,
  deserializeManifest,
  computeManifestHash,
  validateManifest,
} from "./manifest.js";
export {
  WORKFLOW_MANIFEST_TYPE,
  serializeWorkflowManifest,
  computeWorkflowManifestHash,
  validateWorkflowManifest,
} from "./workflow-manifest.js";
export type { WorkflowManifest } from "./workflow-manifest.js";
export { parseSkillMd, convertToAgentOSManifest } from "./skill-md-parser.js";
export type { SkillMdMetadata } from "./skill-md-parser.js";
export type { SkillManifest } from "./types.js";
export { scanSkillsDirectory } from "./skill-md-scanner.js";
export {
  resolveAgentAddress,
  resolveAgentByName,
  resolveSkillByName,
  reverseResolve,
  parseSubname,
  isValidSuiNSName,
} from "./suins-resolve.js";
export {
  parseSuiperpowerOutput,
  detectSuperpowerProject,
  buildManifestFromSuperpowerOutput,
} from "./suiperpower.js";
export type { SuiperpowerBuildResult } from "./suiperpower.js";

// Real Mysten Seal encryption (write path only). Node-only — pulls @mysten/seal
// + a read-only SuiClient; deliberately NOT in the browser entry or the
// signer-agnostic workflow engine (the engine reaches it via injected ctx.seal).
export { sealEncryptReal, isRealSeal, SEAL_REAL_MAGIC } from "./seal-real.js";
export type {
  SealEncryptRealOptions,
  SealEncryptRealResult,
  SealNetwork,
} from "./seal-real.js";

// Real Mysten Seal DECRYPTION (read path). CLIENT-SIDE only — needs a user
// wallet-signed SessionKey + a key-server round-trip + the on-chain seal_approve
// check, so it is NOT run by the signer-agnostic workflow engine. Exposed from
// the Node entry for a dApp / CLI that holds the user's wallet.
export { sealDecryptReal, stripRealSealMarker } from "./seal-decrypt-real.js";
export type {
  SealDecryptRealOptions,
  SignPersonalMessage,
} from "./seal-decrypt-real.js";

// Workflow engine (signer-agnostic; host injects execute/upload/memory).
export { runWorkflow } from "./workflow/run.js";
export type { RunWorkflowOptions, RunWorkflowResult } from "./workflow/run.js";
export { executors } from "./workflow/executors.js";
export type { StepExecutor, StepExecutorResult } from "./workflow/executors.js";
export {
  classifyError,
  diagnoseStep,
  preflight,
  ONCHAIN_NODE_TYPES,
} from "./workflow/diagnose.js";
export type {
  StepErrorCode,
  DiagnosisSeverity,
  StepDiagnosis,
  ClassifiedError,
  PreflightEnv,
  PreflightOutcome,
  PreflightNode,
  PreflightReport,
} from "./workflow/diagnose.js";
export type {
  WorkflowNodeType,
  WorkflowNode,
  WorkflowEdge,
  WorkflowGraph,
  StepStatus,
  StepResult,
  RunContext,
  ResolvedAgent,
  ResolvedSkill,
  ResolvedManifest,
  RunResolveBundle,
  RunBuildBundle,
  BuildCallSubAgentOptions,
  BuildCallSubAgentResult,
  BuildDelegateOptions,
  BuildAttestOptions,
} from "./workflow/types.js";
