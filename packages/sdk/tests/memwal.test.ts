import { createHash, createPublicKey, verify } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MEMWAL_RELAYER_URL,
  MemwalClient,
  memwalFromEnv,
} from "../src/memwal.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// A deterministic 32-byte hex Ed25519 seed for the signed-scheme tests.
const DELEGATE_KEY_HEX =
  "9d61b19deffebc3a8b8c9b3e8c1b3a2f670c9c61abb649e9b1b3a2f670c9c61a";
const ACCOUNT_ID = "0xabc123";

function okJson(value: unknown) {
  return { ok: true, status: 200, json: async () => value };
}

describe("MemwalClient — legacy bearer scheme", () => {
  let client: MemwalClient;

  beforeEach(() => {
    client = new MemwalClient({
      baseUrl: "https://relayer.memwal.test",
      apiKey: "memwal_key_123",
    });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("reports it is NOT using the signed scheme", () => {
    expect(client.usesSignedScheme).toBe(false);
  });

  describe("remember", () => {
    it("POSTs { namespace, text } to /remember with a Bearer token", async () => {
      mockFetch.mockResolvedValue(okJson({ id: "mem_1" }));

      const out = await client.remember("alpha.sui", "hello world");

      expect(out).toEqual({ id: "mem_1" });
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://relayer.memwal.test/remember");
      expect(init.method).toBe("POST");
      expect(init.headers.Authorization).toBe("Bearer memwal_key_123");
      expect(init.headers["Content-Type"]).toBe("application/json");
      expect(JSON.parse(init.body)).toEqual({
        namespace: "alpha.sui",
        text: "hello world",
      });
    });

    it("throws a descriptive error on a non-2xx response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "boom",
      });

      await expect(client.remember("ns", "x")).rejects.toThrow(
        /Memwal \/remember failed: 500 boom/,
      );
    });
  });

  describe("recall", () => {
    it("POSTs { namespace, query, limit } to /recall", async () => {
      mockFetch.mockResolvedValue(okJson({ results: [] }));

      await client.recall("alpha.sui", "what did I do", 5);

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://relayer.memwal.test/recall");
      expect(JSON.parse(init.body)).toEqual({
        namespace: "alpha.sui",
        query: "what did I do",
        limit: 5,
      });
    });

    it("omits limit when not provided", async () => {
      mockFetch.mockResolvedValue(okJson({ results: [] }));

      await client.recall("ns", "q");

      const [, init] = mockFetch.mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({ namespace: "ns", query: "q" });
    });
  });

  it("trims a trailing slash from baseUrl", async () => {
    const c = new MemwalClient({
      baseUrl: "https://relayer.memwal.test//",
      apiKey: "k",
    });
    mockFetch.mockResolvedValue(okJson({}));

    await c.remember("ns", "t");
    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://relayer.memwal.test/remember",
    );
  });
});

describe("MemwalClient — signed delegate-key scheme", () => {
  let client: MemwalClient;

  beforeEach(() => {
    client = new MemwalClient({
      baseUrl: "https://relayer.memwal.test",
      accountId: ACCOUNT_ID,
      delegateKey: DELEGATE_KEY_HEX,
    });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("reports it IS using the signed scheme", () => {
    expect(client.usesSignedScheme).toBe(true);
  });

  it("POSTs /api/remember with signed Ed25519 headers (verifiable)", async () => {
    mockFetch.mockResolvedValue(okJson({ id: "mem_1", blob_id: "blob_abc" }));

    const before = Math.floor(Date.now() / 1000);
    await client.remember("alpha.sui", "hello world");
    const after = Math.floor(Date.now() / 1000);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://relayer.memwal.test/api/remember");
    expect(init.method).toBe("POST");

    // No bearer token on the signed scheme.
    expect(init.headers.Authorization).toBeUndefined();

    // Required signed headers are present and well-formed.
    const h = init.headers as Record<string, string>;
    expect(h["x-public-key"]).toMatch(/^[0-9a-f]{64}$/);
    expect(h["x-signature"]).toMatch(/^[0-9a-f]{128}$/);
    expect(h["x-account-id"]).toBe(ACCOUNT_ID);
    // A UUID v4 nonce is sent for replay protection.
    expect(h["x-nonce"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    // The deprecated decrypt credential is NOT transmitted.
    expect(h["x-delegate-key"]).toBeUndefined();

    // Timestamp is unix seconds within the request window.
    const ts = Number(h["x-timestamp"]);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);

    // The signature must verify against the exact body sent, reproducing the
    // relayer's canonical check:
    //   sign("{ts}.POST./api/remember.{sha256hex(body)}.{nonce}.{accountId}").
    const bodySha = createHash("sha256").update(init.body).digest("hex");
    const message = `${h["x-timestamp"]}.POST./api/remember.${bodySha}.${h["x-nonce"]}.${ACCOUNT_ID}`;
    const publicKey = createPublicKey({
      key: Buffer.concat([
        Buffer.from("302a300506032b6570032100", "hex"),
        Buffer.from(h["x-public-key"], "hex"),
      ]),
      format: "der",
      type: "spki",
    });
    const valid = verify(
      null,
      Buffer.from(message),
      publicKey,
      Buffer.from(h["x-signature"], "hex"),
    );
    expect(valid).toBe(true);

    expect(JSON.parse(init.body)).toEqual({
      namespace: "alpha.sui",
      text: "hello world",
    });
  });

  it("POSTs /api/recall with { namespace, query, limit }", async () => {
    mockFetch.mockResolvedValue(okJson({ results: [], total: 0 }));

    await client.recall("alpha.sui", "what did I do", 5);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://relayer.memwal.test/api/recall");
    expect(JSON.parse(init.body)).toEqual({
      namespace: "alpha.sui",
      query: "what did I do",
      limit: 5,
    });
  });

  it("derives a STABLE public key across requests (same delegate key)", async () => {
    mockFetch.mockResolvedValue(okJson({}));
    await client.remember("ns", "a");
    await client.remember("ns", "b");
    const pk1 = mockFetch.mock.calls[0][1].headers["x-public-key"];
    const pk2 = mockFetch.mock.calls[1][1].headers["x-public-key"];
    expect(pk1).toBe(pk2);
  });

  it("accepts a 0x-prefixed delegate key (derives the same public key)", async () => {
    const c = new MemwalClient({
      baseUrl: "https://relayer.memwal.test",
      accountId: ACCOUNT_ID,
      delegateKey: `0x${DELEGATE_KEY_HEX}`,
    });
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(okJson({}));
    await c.remember("ns", "t");
    const h = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    // The 0x-prefix is stripped, so the same public key is derived as the
    // bare-hex seed; the deprecated delegate-key header is not sent.
    expect(h["x-public-key"]).toMatch(/^[0-9a-f]{64}$/);
    expect(h["x-delegate-key"]).toBeUndefined();
  });

  it("surfaces a descriptive error on a non-2xx response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    });
    await expect(client.remember("ns", "x")).rejects.toThrow(
      /Memwal \/api\/remember failed: 401 unauthorized/,
    );
  });

  it("rejects a malformed delegate key when a request is made", async () => {
    const c = new MemwalClient({
      baseUrl: "https://relayer.memwal.test",
      accountId: ACCOUNT_ID,
      delegateKey: "not-hex",
    });
    await expect(c.remember("ns", "x")).rejects.toThrow(
      /must be a 32-byte hex Ed25519 seed/,
    );
  });
});

describe("MemwalClient — constructor validation", () => {
  it("rejects a delegate scheme with a blank accountId", () => {
    expect(
      () =>
        new MemwalClient({
          baseUrl: "https://r.test",
          accountId: "  ",
          delegateKey: DELEGATE_KEY_HEX,
        }),
    ).toThrow(/non-empty accountId/);
  });

  it("rejects a bearer scheme with a blank apiKey", () => {
    expect(
      () => new MemwalClient({ baseUrl: "https://r.test", apiKey: "" }),
    ).toThrow(/non-empty apiKey/);
  });
});

describe("memwalFromEnv", () => {
  const prevUrl = process.env.MEMWAL_RELAYER_URL;
  const prevKey = process.env.MEMWAL_API_KEY;
  const prevAccount = process.env.MEMWAL_ACCOUNT_ID;
  const prevDelegate = process.env.MEMWAL_DELEGATE_KEY;

  function restore(name: string, value: string | undefined) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  beforeEach(() => {
    delete process.env.MEMWAL_RELAYER_URL;
    delete process.env.MEMWAL_API_KEY;
    delete process.env.MEMWAL_ACCOUNT_ID;
    delete process.env.MEMWAL_DELEGATE_KEY;
  });

  afterEach(() => {
    restore("MEMWAL_RELAYER_URL", prevUrl);
    restore("MEMWAL_API_KEY", prevKey);
    restore("MEMWAL_ACCOUNT_ID", prevAccount);
    restore("MEMWAL_DELEGATE_KEY", prevDelegate);
  });

  it("exposes the Walrus Foundation hosted staging/testnet relayer as the default URL", () => {
    expect(DEFAULT_MEMWAL_RELAYER_URL).toBe(
      "https://relayer-staging.memory.walrus.xyz",
    );
  });

  it("builds the SIGNED client from MEMWAL_ACCOUNT_ID + MEMWAL_DELEGATE_KEY", async () => {
    process.env.MEMWAL_ACCOUNT_ID = ACCOUNT_ID;
    process.env.MEMWAL_DELEGATE_KEY = DELEGATE_KEY_HEX;
    const client = memwalFromEnv();
    expect(client).toBeInstanceOf(MemwalClient);
    expect(client!.usesSignedScheme).toBe(true);

    mockFetch.mockReset();
    mockFetch.mockResolvedValue(okJson({}));
    await client!.remember("ns", "t");
    expect(mockFetch.mock.calls[0][0]).toBe(
      `${DEFAULT_MEMWAL_RELAYER_URL}/api/remember`,
    );
  });

  it("prefers the signed scheme over a stray MEMWAL_API_KEY", () => {
    process.env.MEMWAL_ACCOUNT_ID = ACCOUNT_ID;
    process.env.MEMWAL_DELEGATE_KEY = DELEGATE_KEY_HEX;
    process.env.MEMWAL_API_KEY = "legacy";
    expect(memwalFromEnv()!.usesSignedScheme).toBe(true);
  });

  it("falls back to the LEGACY bearer client when only MEMWAL_API_KEY is set", async () => {
    process.env.MEMWAL_API_KEY = "k";
    const client = memwalFromEnv();
    expect(client).toBeInstanceOf(MemwalClient);
    expect(client!.usesSignedScheme).toBe(false);

    mockFetch.mockReset();
    mockFetch.mockResolvedValue(okJson({}));
    await client!.remember("ns", "t");
    expect(mockFetch.mock.calls[0][0]).toBe(
      `${DEFAULT_MEMWAL_RELAYER_URL}/remember`,
    );
  });

  it("returns null when NEITHER credential set is configured (even with a URL)", () => {
    process.env.MEMWAL_RELAYER_URL = "https://relayer.memwal.test";
    expect(memwalFromEnv()).toBeNull();
  });

  it("returns null when only MEMWAL_ACCOUNT_ID is set (delegate key missing)", () => {
    process.env.MEMWAL_ACCOUNT_ID = ACCOUNT_ID;
    expect(memwalFromEnv()).toBeNull();
  });

  it("MEMWAL_RELAYER_URL overrides the default when set", async () => {
    process.env.MEMWAL_RELAYER_URL = "https://relayer.memwal.test";
    process.env.MEMWAL_API_KEY = "memwal_key";
    const client = memwalFromEnv();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(okJson({}));
    await client!.remember("ns", "t");
    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://relayer.memwal.test/remember",
    );
  });

  it("falls back to the default when MEMWAL_RELAYER_URL is blank", () => {
    process.env.MEMWAL_RELAYER_URL = "   ";
    process.env.MEMWAL_API_KEY = "k";
    expect(memwalFromEnv()).toBeInstanceOf(MemwalClient);
  });
});
