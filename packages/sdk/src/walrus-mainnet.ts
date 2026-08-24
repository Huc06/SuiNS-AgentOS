/**
 * Mainnet Walrus uploads via the official `@mysten/walrus` client + Mysten's
 * public mainnet Upload Relay.
 *
 * Node-only (like `seal-real.ts`): `@mysten/walrus` pulls a WASM erasure-coding
 * module that has no place in the signer-agnostic browser/workflow-engine
 * bundle (`index.ts`) — only the Node entry (`node.ts`, used by the CLI, MCP
 * server, and frontend API routes) exposes this factory.
 *
 * Why this exists: the plain HTTP publisher/aggregator {@link WalrusClient}
 * (see `./walrus.ts`) has no public, unauthenticated endpoint on mainnet —
 * that's testnet-only. Mysten Labs instead runs a public Upload Relay for
 * mainnet (`https://upload-relay.mainnet.walrus.space`) that a signer can pay
 * a small per-blob tip to use, without anyone needing to self-host a
 * publisher or the relay itself. See docs.wal.app's "Choose your upload path"
 * guide and the Upload Relay operator guide for the underlying design.
 */
import { SuiGrpcClient } from "@mysten/sui/grpc";
import type { Signer } from "@mysten/sui/cryptography";
import { walrus } from "@mysten/walrus";

import {
  DEFAULT_MAINNET_UPLOAD_RELAY,
  WalrusClient,
  WalrusUploadRelayClient,
  type WalrusMainnetOperations,
  type WalrusUploader,
} from "./walrus.js";

export interface CreateMainnetWalrusUploaderOptions {
  /**
   * The signer that pays gas + the relay's tip and owns the registered blob.
   * Only required if you call `uploadBlob` — omit it for a read-only
   * (`downloadBlob`) uploader.
   */
  signer?: Signer;
  /** Sui mainnet fullnode gRPC URL. Defaults to the public mainnet endpoint. */
  rpcUrl?: string;
  /** Upload Relay host. Defaults to Mysten's public mainnet relay. */
  uploadRelayHost?: string;
  /**
   * Maximum tip (in MIST) the client will pay the relay per upload, letting
   * `WalrusClient` compute the exact tip from the relay's `/v1/tip-config`
   * instead of the caller hardcoding a tip strategy. Defaults to a small cap
   * generous enough for typical skill/workflow manifest sizes (a few KiB) at
   * the relay's published linear rate (40 MIST per encoded KiB as of this
   * writing) — override for larger blobs.
   */
  maxTipMist?: number;
}

const DEFAULT_MAX_TIP_MIST = 50_000;

/**
 * Resolve the real on-disk path to `@mysten/walrus-wasm`'s Node WASM binary,
 * to pass as `wasmUrl` to the `walrus()` extension below.
 *
 * Why this is necessary: per the official docs
 * (sdk.mystenlabs.com/walrus, "Loading the WASM module... In Next.js, when
 * using Walrus in API routes"), bundlers can fail to locate this binary at
 * runtime even with `serverExternalPackages: ["@mysten/walrus",
 * "@mysten/walrus-wasm"]` set (the docs' own suggested fix) — confirmed
 * against this repo's actual Next.js build, which still rewrites the path
 * webpack expects it at to `.next/server/chunks/walrus_wasm_bg.wasm` (which
 * does not exist), failing "Collecting page data" with ENOENT for every
 * route reaching this module. The docs' documented fallback is to resolve
 * and pass `wasmUrl` explicitly, sidestepping the bundler's resolution.
 *
 * `@mysten/walrus-wasm` is only a transitive dependency of `@mysten/walrus`
 * (not a direct one of this package), so a plain `require.resolve()` can't
 * find it — `createRequire` + the `paths` option walks node_modules
 * resolution starting from `@mysten/walrus`'s own location instead, which
 * works regardless of the package manager's node_modules layout (pnpm's
 * nested/symlinked structure included).
 */
function resolveWalrusWasmUrl(): string | undefined {
  try {
    const { createRequire } = require("node:module") as typeof import("node:module");
    const req = createRequire(import.meta.url);
    const walrusEntry = req.resolve("@mysten/walrus");
    const wasmPackageEntry = req.resolve("@mysten/walrus-wasm", {
      paths: [walrusEntry],
    });
    // wasmPackageEntry is .../@mysten/walrus-wasm/index.js — the Node WASM
    // binary lives alongside it at nodejs/walrus_wasm_bg.wasm.
    const wasmPath = wasmPackageEntry.replace(
      /index\.(m?js)$/,
      "nodejs/walrus_wasm_bg.wasm",
    );
    return new URL(`file://${wasmPath}`).href;
  } catch {
    // Resolution is best-effort: if it fails, omit wasmUrl and let @mysten/
    // walrus fall back to its own default loading behavior.
    return undefined;
  }
}

const WASM_URL = resolveWalrusWasmUrl();

/**
 * Build a {@link WalrusUploader} backed by `@mysten/walrus` + the mainnet
 * Upload Relay. Uploading (unlike the testnet {@link WalrusClient}) requires
 * a signer — the relay does not sponsor gas or storage rent, so the
 * underlying `writeBlob` call signs and submits the register/certify
 * transactions itself. Downloading works without one; pass `signer` only
 * when you intend to upload.
 *
 * `uploadRelayHost`/`maxTipMist` fall back to the `WALRUS_MAINNET_UPLOAD_RELAY_HOST`
 * / `WALRUS_MAINNET_MAX_TIP_MIST` env vars (then Mysten's public relay / a
 * conservative tip cap) when omitted — matching how `memwalFromEnv()` and
 * `HarborClient.getApiKey()` read their own env fallbacks, so callers don't
 * need to plumb these through by hand at every call site.
 */
export function createMainnetWalrusUploader(
  options: CreateMainnetWalrusUploaderOptions = {},
): WalrusUploader {
  const rpcUrl =
    options.rpcUrl ?? "https://sui-mainnet-rpc.publicnode.com";
  const uploadRelayHost =
    options.uploadRelayHost ??
    process.env.WALRUS_MAINNET_UPLOAD_RELAY_HOST?.trim() ??
    DEFAULT_MAINNET_UPLOAD_RELAY;
  const envMaxTip = process.env.WALRUS_MAINNET_MAX_TIP_MIST?.trim();
  const maxTipMist =
    options.maxTipMist ??
    (envMaxTip && Number.isFinite(Number(envMaxTip))
      ? Number(envMaxTip)
      : DEFAULT_MAX_TIP_MIST);
  const client = new SuiGrpcClient({ network: "mainnet", baseUrl: rpcUrl }).$extend(
    walrus({
      ...(WASM_URL ? { wasmUrl: WASM_URL } : {}),
      uploadRelay: {
        host: uploadRelayHost,
        sendTip: { max: maxTipMist },
      },
    }),
  );
  return new WalrusUploadRelayClient(
    client.walrus as unknown as WalrusMainnetOperations,
    options.signer,
  );
}

export interface GetWalrusUploaderOptions {
  network: "mainnet" | "testnet" | "devnet";
  /**
   * Required on mainnet ONLY if you intend to call `uploadBlob` (the Upload
   * Relay path needs a signer to pay gas + the relay's tip) — a download-only
   * uploader can omit it. Ignored on testnet/devnet, where the plain HTTP
   * publisher/aggregator {@link WalrusClient} needs no signer at all.
   */
  signer?: Signer;
  rpcUrl?: string;
  uploadRelayHost?: string;
  maxTipMist?: number;
  /** Passed through to {@link WalrusClient} on testnet/devnet. */
  publisherUrl?: string;
  aggregatorUrl?: string;
}

/**
 * Select the right {@link WalrusUploader} for `network`: the mainnet Upload
 * Relay path on mainnet, or the plain HTTP publisher/aggregator
 * {@link WalrusClient} everywhere else. This is the single entry point
 * callers should use instead of constructing either client directly and
 * branching on network themselves.
 *
 * Does NOT require `signer` up front even on mainnet — the returned
 * uploader's `uploadBlob` throws its own clear error if a signer is needed
 * but wasn't provided, so a read-only (`downloadBlob`) caller on mainnet
 * never needs one at all.
 */
export function getWalrusUploader(
  options: GetWalrusUploaderOptions,
): WalrusUploader {
  if (options.network === "mainnet") {
    return createMainnetWalrusUploader({
      ...(options.signer ? { signer: options.signer } : {}),
      ...(options.rpcUrl ? { rpcUrl: options.rpcUrl } : {}),
      ...(options.uploadRelayHost
        ? { uploadRelayHost: options.uploadRelayHost }
        : {}),
      ...(options.maxTipMist !== undefined
        ? { maxTipMist: options.maxTipMist }
        : {}),
    });
  }
  return new WalrusClient({
    ...(options.publisherUrl ? { publisherUrl: options.publisherUrl } : {}),
    ...(options.aggregatorUrl ? { aggregatorUrl: options.aggregatorUrl } : {}),
  });
}
