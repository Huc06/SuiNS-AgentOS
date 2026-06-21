/**
 * Memwal — a thin REST client for the Walrus Memory ("memwal") relayer
 * (Walrus-backed, SEAL-encrypted vector memory for agents).
 *
 * The relayer is the managed/self-hosted Rust service that does all the heavy
 * lifting server-side (embedding, SEAL encryption, Walrus upload, vector
 * indexing). The SDK just authenticates and sends text.
 *
 * ## Authentication — two schemes
 *
 * The REAL Walrus Memory relayer protects its `/api/*` routes with **signed
 * Ed25519 headers**, NOT a plain bearer token. Per the official docs
 * (https://docs.wal.app/walrus-memory/relayer/api-reference) each request
 * carries:
 *   - `x-public-key` — hex Ed25519 public key (32 bytes, derived from the
 *     delegate key)
 *   - `x-signature`  — hex Ed25519 signature (64 bytes) over the canonical
 *     message `{timestamp}.{method}.{path_and_query}.{body_sha256}.{nonce}.{account_id}`
 *   - `x-timestamp`  — unix seconds (the relayer enforces a 5-minute window)
 *   - `x-nonce`      — a UUID v4 nonce; the relayer records it for replay
 *     protection (`featureFlags["auth.accountBoundNonce"]` is on in production)
 *   - `x-account-id` — the `MemWalAccount` object id (account hint). Official
 *     SDKs always send it and include it in the canonical signature.
 *
 * The relayer recomputes `sha256(body)`, verifies the Ed25519 signature against
 * `x-public-key` (over the canonical message above), then resolves the owner by
 * looking the public key up in the on-chain `MemWalAccount.delegate_keys`. The
 * protected endpoints are `POST {baseUrl}/api/remember` and
 * `POST {baseUrl}/api/recall`.
 *
 * NOTE: the relayer-managed (default) flow does NOT send a decrypt credential.
 * The legacy `x-delegate-key` header is **deprecated** (the live relayer's
 * `/health` lists it under `deprecations`, removed at API `2.0.0`, superseded by
 * `x-seal-session`), so this client no longer sends it. The delegate private key
 * is still used locally to derive the public key and sign requests; it is just
 * never transmitted.
 *
 * The client picks the scheme from how it is constructed:
 *   - **Delegate-key (signed) scheme** — when an `accountId` + `delegateKey`
 *     are supplied. This is the real Walrus Memory auth. Targets `/api/*`.
 *   - **Legacy bearer scheme** — when only an `apiKey` is supplied. Kept for
 *     backward-compatibility with any custom/self-hosted relayer that still
 *     accepts `Authorization: Bearer`. Targets `/remember` / `/recall`.
 *
 * `memwalFromEnv()` reads, in priority order:
 *   - `MEMWAL_ACCOUNT_ID` + `MEMWAL_DELEGATE_KEY` ⇒ signed scheme, or
 *   - `MEMWAL_API_KEY` ⇒ legacy bearer scheme.
 * Plus `MEMWAL_RELAYER_URL` (optional — defaults to the Walrus Foundation hosted
 * STAGING/Testnet relayer, see {@link DEFAULT_MEMWAL_RELAYER_URL}). It returns
 * `null` only when NEITHER credential is configured, so callers (e.g. the
 * workflow memory executor) skip memory gracefully rather than crashing.
 *
 * Node-only: re-exported from `@agentos/sdk/node` (reads `process.env` and uses
 * Node's built-in `crypto` for Ed25519 — no extra dependency, no browser
 * bundle). The signing is standard RFC 8032 Ed25519, byte-for-byte identical to
 * the `@noble/ed25519` the reference memwal SDK uses.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomUUID,
  sign,
} from "node:crypto";

/**
 * Walrus Foundation hosted **Staging/Testnet** Walrus Memory relayer base URL.
 * AgentOS targets Sui testnet, so the testnet/staging relayer is the right
 * default here.
 *
 * Source: the OFFICIAL Walrus Memory docs, "Public Relayer → Walrus Foundation
 * hosted endpoints" (https://docs.wal.app/walrus-memory/relayer/public-relayer):
 *   - Production (Mainnet) = `https://relayer.memory.walrus.xyz`
 *   - Staging (Testnet)    = `https://relayer-staging.memory.walrus.xyz`
 * Both are live (`GET /health` → 200). The SDK `MemWalConfig` default
 * `serverUrl` is the production URL; we default to the testnet/staging one to
 * match AgentOS's testnet target.
 *
 * (The previously-guessed `relayer.staging.memwal.ai` / `relayer.memwal.ai`
 * hosts are NOT the official endpoints — `*.memory.walrus.xyz` is canonical.)
 *
 * Override via `MEMWAL_RELAYER_URL` for production / a self-hosted relayer.
 */
export const DEFAULT_MEMWAL_RELAYER_URL =
  "https://relayer-staging.memory.walrus.xyz";

/**
 * Walrus Foundation hosted **Production/Mainnet** Walrus Memory relayer base URL
 * (the SDK's own default `serverUrl`). Exported for callers that run on mainnet;
 * set `MEMWAL_RELAYER_URL` to this value to target it.
 */
export const PRODUCTION_MEMWAL_RELAYER_URL =
  "https://relayer.memory.walrus.xyz";

/**
 * Options for the **delegate-key (signed)** scheme — the real Walrus Memory
 * auth. Every `/api/*` request is signed with the Ed25519 delegate key.
 */
export interface MemwalDelegateOptions {
  /** Base URL of the Memwal relayer (no trailing slash required). */
  baseUrl: string;
  /** `MemWalAccount` object id (`0x…`) — sent as the `x-account-id` hint. */
  accountId: string;
  /**
   * Ed25519 delegate private key. Accepts a 32-byte hex seed (with or without a
   * `0x` prefix) or a Sui `suiprivkey1…` bech32 string.
   */
  delegateKey: string;
}

/**
 * Options for the **legacy bearer** scheme — kept for backward-compat with any
 * relayer that still accepts `Authorization: Bearer {apiKey}`.
 */
export interface MemwalApiKeyOptions {
  /** Base URL of the Memwal relayer (no trailing slash required). */
  baseUrl: string;
  /** Bearer API key for the relayer. */
  apiKey: string;
}

/** Constructor options — either the signed scheme or the legacy bearer scheme. */
export type MemwalClientOptions = MemwalDelegateOptions | MemwalApiKeyOptions;

/** DER (PKCS#8) prefix for an Ed25519 private key carrying a raw 32-byte seed. */
const ED25519_PKCS8_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
);

/** Strip a leading `0x`/`0X` and surrounding whitespace from a hex string. */
function stripHexPrefix(hex: string): string {
  const trimmed = hex.trim();
  return trimmed.startsWith("0x") || trimmed.startsWith("0X")
    ? trimmed.slice(2)
    : trimmed;
}

function lowerHex(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf).toString("hex");
}

/**
 * Decode a delegate key into its raw 32-byte Ed25519 seed. Accepts a hex seed
 * (with/without `0x`) or a Sui `suiprivkey1…` bech32 string.
 */
async function decodeDelegateKey(key: string): Promise<Uint8Array> {
  const trimmed = key.trim();
  if (trimmed.startsWith("suiprivkey1")) {
    // Lazy-import keeps @mysten/sui an optional/external dep (Node-only path).
    const { decodeSuiPrivateKey } = await import("@mysten/sui/cryptography");
    const { secretKey } = decodeSuiPrivateKey(trimmed);
    // decodeSuiPrivateKey returns the 32-byte Ed25519 seed.
    return secretKey;
  }
  const hex = stripHexPrefix(trimmed);
  if (hex.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(
      "MEMWAL_DELEGATE_KEY must be a 32-byte hex Ed25519 seed or a suiprivkey1… string",
    );
  }
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

/**
 * A pre-derived Ed25519 delegate key: the Node `KeyObject` used to sign, plus
 * the public-key hex (`x-public-key`) and the account id hint (`x-account-id`)
 * sent as headers. The raw delegate seed is NOT retained here — it is only used
 * transiently to build `privateKey`, never transmitted (the `x-delegate-key`
 * header is deprecated).
 */
interface DelegateKeyMaterial {
  privateKey: import("node:crypto").KeyObject;
  publicKeyHex: string;
  accountId: string;
}

/**
 * Minimal REST client for the Memwal relayer.
 *
 * - **Signed scheme** (`accountId` + `delegateKey`): targets `/api/remember`
 *   and `/api/recall`, signing each request with the Ed25519 delegate key.
 * - **Legacy bearer scheme** (`apiKey`): targets `/remember` and `/recall` with
 *   `Authorization: Bearer {apiKey}`.
 */
export class MemwalClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly delegateOptions?: MemwalDelegateOptions;
  /** Lazily-derived signing material (Ed25519 key derivation is one-time). */
  private delegate?: Promise<DelegateKeyMaterial>;

  constructor(options: MemwalClientOptions) {
    // Trim a trailing slash so path concatenation stays predictable.
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    if ("delegateKey" in options) {
      if (!options.accountId?.trim()) {
        throw new Error("Memwal delegate scheme requires a non-empty accountId");
      }
      if (!options.delegateKey?.trim()) {
        throw new Error("Memwal delegate scheme requires a non-empty delegateKey");
      }
      this.delegateOptions = options;
    } else {
      if (!options.apiKey?.trim()) {
        throw new Error("Memwal bearer scheme requires a non-empty apiKey");
      }
      this.apiKey = options.apiKey;
    }
  }

  /** True when this client uses the signed delegate-key scheme. */
  get usesSignedScheme(): boolean {
    return this.delegateOptions !== undefined;
  }

  /**
   * Persist `text` into the agent's memory `namespace`.
   *
   * @throws if the relayer responds with a non-2xx status.
   */
  async remember(namespace: string, text: string): Promise<unknown> {
    return this.request("remember", { namespace, text });
  }

  /**
   * Semantic-recall up to `limit` memories matching `query` from `namespace`.
   *
   * @throws if the relayer responds with a non-2xx status.
   */
  async recall(
    namespace: string,
    query: string,
    limit?: number,
  ): Promise<unknown> {
    return this.request("recall", {
      namespace,
      query,
      ...(limit !== undefined ? { limit } : {}),
    });
  }

  /** Dispatch to the signed or bearer transport depending on configuration. */
  private async request(
    op: "remember" | "recall",
    body: Record<string, unknown>,
  ): Promise<unknown> {
    if (this.delegateOptions) {
      // The real relayer namespaces protected routes under /api.
      return this.signedPost(`/api/${op}`, body);
    }
    return this.bearerPost(`/${op}`, body);
  }

  /** Derive (once) the Ed25519 signing material from the delegate key. */
  private getDelegate(): Promise<DelegateKeyMaterial> {
    if (!this.delegate) {
      const opts = this.delegateOptions!;
      this.delegate = (async () => {
        const seed = await decodeDelegateKey(opts.delegateKey);
        const privateKey = createPrivateKey({
          key: Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(seed)]),
          format: "der",
          type: "pkcs8",
        });
        const spki = createPublicKey(privateKey).export({
          format: "der",
          type: "spki",
        });
        // The raw 32-byte public key is the SPKI suffix.
        const publicKeyHex = lowerHex(spki.subarray(spki.length - 32));
        return {
          privateKey,
          publicKeyHex,
          accountId: opts.accountId,
        };
      })();
    }
    return this.delegate;
  }

  /**
   * Signed-header request. The canonical signed message (per the official
   * Walrus Memory relayer API reference) is
   * `{timestamp}.{method}.{path_and_query}.{sha256hex(body)}.{nonce}.{account_id}`
   * and the body hashed is the EXACT JSON string sent on the wire
   * (byte-for-byte), matching the relayer's server-side recomputation. `path`
   * here carries any query string (these routes use none, so it is the bare
   * path). A fresh UUID v4 nonce is generated per request for replay protection
   * and sent as `x-nonce`. The deprecated `x-delegate-key` decrypt credential is
   * intentionally NOT sent (relayer-managed flow).
   */
  private async signedPost(
    path: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const { privateKey, publicKeyHex, accountId } = await this.getDelegate();

    const method = "POST";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomUUID();
    const bodyStr = JSON.stringify(body);
    const bodySha256 = createHash("sha256").update(bodyStr).digest("hex");
    const message = `${timestamp}.${method}.${path}.${bodySha256}.${nonce}.${accountId}`;
    const signatureHex = lowerHex(sign(null, Buffer.from(message), privateKey));

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-public-key": publicKeyHex,
        "x-signature": signatureHex,
        "x-timestamp": timestamp,
        "x-nonce": nonce,
        "x-account-id": accountId,
      },
      body: bodyStr,
    });

    return this.handle(path, response);
  }

  /** Legacy bearer-token request. */
  private async bearerPost(
    path: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    return this.handle(path, response);
  }

  private async handle(path: string, response: Response): Promise<unknown> {
    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Memwal ${path} failed: ${response.status} ${errBody}`);
    }
    return response.json();
  }
}

/**
 * Construct a {@link MemwalClient} from the environment, or `null` when no
 * credentials are configured.
 *
 * Credential precedence:
 *   1. `MEMWAL_ACCOUNT_ID` + `MEMWAL_DELEGATE_KEY` ⇒ the real **signed** Walrus
 *      Memory scheme (each request Ed25519-signed by the delegate key).
 *   2. `MEMWAL_API_KEY` ⇒ the **legacy bearer** scheme (backward-compat).
 *
 * `MEMWAL_RELAYER_URL` (optional) overrides the base URL; when unset/blank it
 * falls back to {@link DEFAULT_MEMWAL_RELAYER_URL} (the Walrus Foundation hosted
 * staging/testnet relayer). Set it to {@link PRODUCTION_MEMWAL_RELAYER_URL} for
 * mainnet. Returns `null` ONLY when neither credential set is present, so the
 * memory step skips gracefully when memwal is not configured.
 */
export function memwalFromEnv(): MemwalClient | null {
  const baseUrl =
    process.env.MEMWAL_RELAYER_URL?.trim() || DEFAULT_MEMWAL_RELAYER_URL;

  const accountId = process.env.MEMWAL_ACCOUNT_ID?.trim();
  const delegateKey = process.env.MEMWAL_DELEGATE_KEY?.trim();
  if (accountId && delegateKey) {
    return new MemwalClient({ baseUrl, accountId, delegateKey });
  }

  const apiKey = process.env.MEMWAL_API_KEY?.trim();
  if (apiKey) {
    return new MemwalClient({ baseUrl, apiKey });
  }

  return null;
}
