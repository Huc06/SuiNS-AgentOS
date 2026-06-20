/**
 * Memwal — a thin REST client for the agent-memory relayer (Walrus-backed
 * vector memory for agents).
 *
 * The relayer exposes two endpoints, both `POST` with a Bearer token:
 *   - `POST {baseUrl}/remember` `{ namespace, text }`        — persist a memory
 *   - `POST {baseUrl}/recall`   `{ namespace, query, limit }` — semantic recall
 *
 * `memwalFromEnv()` reads `MEMWAL_RELAYER_URL` + `MEMWAL_API_KEY` and returns
 * `null` when either is unset, so callers (e.g. the workflow memory executor)
 * can gracefully skip memory rather than crash when no relayer is configured.
 *
 * Node-only: re-exported from `@agentos/sdk/node` (reads `process.env`).
 */

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
 * Construct a {@link MemwalClient} from the environment, or `null` when the
 * relayer is not configured.
 *
 * Reads `MEMWAL_RELAYER_URL` (base URL) and `MEMWAL_API_KEY` (bearer key);
 * returns `null` if either is missing/blank so the memory step can skip.
 */
export function memwalFromEnv(): MemwalClient | null {
  const baseUrl = process.env.MEMWAL_RELAYER_URL?.trim();
  const apiKey = process.env.MEMWAL_API_KEY?.trim();
  if (!baseUrl || !apiKey) return null;
  return new MemwalClient({ baseUrl, apiKey });
}
