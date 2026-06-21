import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MEMWAL_RELAYER_URL,
  MemwalClient,
  memwalFromEnv,
} from "../src/memwal.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("MemwalClient", () => {
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

  describe("remember", () => {
    it("POSTs { namespace, text } to /remember with a Bearer token", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: "mem_1" }),
      });

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
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      });

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
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ results: [] }),
      });

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
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await c.remember("ns", "t");
    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://relayer.memwal.test/remember",
    );
  });
});

describe("memwalFromEnv", () => {
  const prevUrl = process.env.MEMWAL_RELAYER_URL;
  const prevKey = process.env.MEMWAL_API_KEY;

  afterEach(() => {
    if (prevUrl === undefined) delete process.env.MEMWAL_RELAYER_URL;
    else process.env.MEMWAL_RELAYER_URL = prevUrl;
    if (prevKey === undefined) delete process.env.MEMWAL_API_KEY;
    else process.env.MEMWAL_API_KEY = prevKey;
  });

  it("exposes the public staging relayer as the default URL", () => {
    expect(DEFAULT_MEMWAL_RELAYER_URL).toBe(
      "https://relayer-staging.memory.walrus.xyz",
    );
  });

  it("returns a MemwalClient when ONLY the API key is set (URL defaults)", async () => {
    delete process.env.MEMWAL_RELAYER_URL;
    process.env.MEMWAL_API_KEY = "k";
    const client = memwalFromEnv();
    expect(client).toBeInstanceOf(MemwalClient);

    // The default staging relayer URL is the one actually used for requests.
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    await client!.remember("ns", "t");
    expect(mockFetch.mock.calls[0][0]).toBe(
      `${DEFAULT_MEMWAL_RELAYER_URL}/remember`,
    );
  });

  it("returns null when MEMWAL_API_KEY is unset (even with a URL)", () => {
    process.env.MEMWAL_RELAYER_URL = "https://relayer.memwal.test";
    delete process.env.MEMWAL_API_KEY;
    expect(memwalFromEnv()).toBeNull();
  });

  it("MEMWAL_RELAYER_URL overrides the default when both are set", async () => {
    process.env.MEMWAL_RELAYER_URL = "https://relayer.memwal.test";
    process.env.MEMWAL_API_KEY = "memwal_key";
    const client = memwalFromEnv();
    expect(client).toBeInstanceOf(MemwalClient);

    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
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
