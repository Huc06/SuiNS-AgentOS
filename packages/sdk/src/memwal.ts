/**
 * Memwal — a thin REST client for the agent-memory relayer (Walrus-backed
 * vector memory for agents).
 *
 * The relayer exposes two endpoints, both `POST` with a Bearer token:
 *   - `POST {baseUrl}/remember` `{ namespace, text }`        — persist a memory
 *   - `POST {baseUrl}/recall`   `{ namespace, query, limit }` — semantic recall
 *
 * `memwalFromEnv()` reads `MEMWAL_API_KEY` (required) and `MEMWAL_RELAYER_URL`
 * (optional — defaults to the public Walrus Memory STAGING relayer, see
 * {@link DEFAULT_MEMWAL_RELAYER_URL}). It returns a client whenever the API key
 * is present (even with no relayer URL), and `null` only when the key is unset —
 * so callers (e.g. the workflow memory executor) skip memory gracefully when no
 * key is configured rather than crashing.
 *
 * Node-only: re-exported from `@agentos/sdk/node` (reads `process.env`).
 */

/**
 * Public Walrus Memory (memwal) STAGING relayer base URL — the testnet-facing
 * managed relayer hosted by the Walrus Foundation. AgentOS targets Sui testnet
 * (Harbor → api.testnet.harbor.walrus.xyz), so the testnet/staging relayer is
 * the right default here.
 *
 * Source (verified, two independent points): the memwal monorepo
 * `packages/mcp/src/index.ts` ENV table
 * (`staging: { relayer: "https://relayer-staging.memory.walrus.xyz" }`) and the
 * `docs/relayer/public-relayer.md` "Walrus Foundation hosted endpoints" table
 * (Staging/testnet = `https://relayer-staging.memory.walrus.xyz`). The matching
 * production (mainnet) relayer is `https://relayer.memory.walrus.xyz`.
 *
 * Override via `MEMWAL_RELAYER_URL` for production / a self-hosted relayer.
 */
export const DEFAULT_MEMWAL_RELAYER_URL =
  "https://relayer-staging.memory.walrus.xyz";

export interface MemwalClientOptions {
  /** Base URL of the Memwal relayer (no trailing slash required). */
  baseUrl: string;
  /** Bearer API key for the relayer. */
  apiKey: string;
}

/**
 * Minimal REST client for the Memwal relayer. Every request carries a Bearer
 * token (`Authorization: Bearer {apiKey}`) and a JSON body.
 */
export class MemwalClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(options: MemwalClientOptions) {
    // Trim a trailing slash so path concatenation stays predictable.
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
  }

  /**
   * Persist `text` into the agent's memory `namespace`.
   *
   * @throws if the relayer responds with a non-2xx status.
   */
  async remember(namespace: string, text: string): Promise<unknown> {
    return this.post("/remember", { namespace, text });
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
    return this.post("/recall", {
      namespace,
      query,
      ...(limit !== undefined ? { limit } : {}),
    });
  }

  private async post(
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

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Memwal ${path} failed: ${response.status} ${errBody}`);
    }

    return response.json();
  }
}

/**
 * Construct a {@link MemwalClient} from the environment, or `null` when no API
 * key is configured.
 *
 * Reads `MEMWAL_API_KEY` (bearer key — REQUIRED) and `MEMWAL_RELAYER_URL` (base
 * URL — OPTIONAL). When the relayer URL is unset/blank it falls back to
 * {@link DEFAULT_MEMWAL_RELAYER_URL} (the public staging relayer), so a user
 * only needs to set `MEMWAL_API_KEY` to enable memory. Returns `null` ONLY when
 * the API key is missing/blank, so the memory step skips only on a missing key.
 */
export function memwalFromEnv(): MemwalClient | null {
  const apiKey = process.env.MEMWAL_API_KEY?.trim();
  if (!apiKey) return null;
  const baseUrl =
    process.env.MEMWAL_RELAYER_URL?.trim() || DEFAULT_MEMWAL_RELAYER_URL;
  return new MemwalClient({ baseUrl, apiKey });
}
