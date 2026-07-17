import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import {
  fetchRemoteImage,
  imageFilename,
  isPublicIpAddress,
  readRemoteImageBody,
  selectLookupAddresses,
  validateImageBytes,
  validateImageResponseHeaders,
  validateRemoteImageUrl,
} from "../src/remote-image.js";

describe("safe remote image downloader", () => {
  it("rejects unsafe URL schemes, credentials, local names and private literals", () => {
    expect(() => validateRemoteImageUrl("http://images.example/nft.png")).toThrow(/HTTPS/);
    expect(() => validateRemoteImageUrl("https://user:pass@images.example/nft.png")).toThrow(
      /credentials/,
    );
    expect(() => validateRemoteImageUrl("https://localhost/nft.png")).toThrow(/public/);
    expect(() => validateRemoteImageUrl("https://127.0.0.1/nft.png")).toThrow(/public/);
    expect(() => validateRemoteImageUrl("https://10.0.0.2/nft.png")).toThrow(/public/);
    expect(() => validateRemoteImageUrl("https://images.example:8443/nft.png")).toThrow(
      /default HTTPS port/,
    );
  });

  it("rejects hostnames that resolve to a private or link-local address before any request", async () => {
    await expect(
      fetchRemoteImage("https://images.example/nft.png", {
        resolveHostname: async () => [{ address: "169.254.169.254", family: 4 }],
      }),
    ).rejects.toThrow(/public IP/);
  });

  it("recognizes only public IPs across IPv4 and IPv6 private ranges", () => {
    expect(isPublicIpAddress("8.8.8.8")).toBe(true);
    expect(isPublicIpAddress("10.0.0.1")).toBe(false);
    expect(isPublicIpAddress("172.20.0.1")).toBe(false);
    expect(isPublicIpAddress("192.168.1.10")).toBe(false);
    expect(isPublicIpAddress("::1")).toBe(false);
    expect(isPublicIpAddress("fd00::1")).toBe(false);
  });

  it("rejects non-image MIME, declared oversize payloads, magic mismatches and streamed oversize payloads", async () => {
    expect(() => validateImageResponseHeaders("image/gif", "42", 100)).toThrow(
      /image\/jpeg or image\/png/,
    );
    expect(() => validateImageResponseHeaders("image/png", "101", 100)).toThrow(
      /100-byte limit/,
    );
    expect(() => validateImageBytes(new Uint8Array([1, 2, 3]), "image/png")).toThrow(
      /does not match/,
    );
    const stream = Readable.from([new Uint8Array([1, 2]), new Uint8Array([3, 4])]);
    await expect(readRemoteImageBody(stream, 3)).rejects.toThrow(/3-byte limit/);
  });

  it("returns every validated address when Node lookup requests all mode", () => {
    const addresses = [
      { address: "203.0.113.20", family: 4 as const },
      { address: "2001:4860:4860::8888", family: 6 as const },
    ];
    expect(selectLookupAddresses(addresses, true)).toEqual(addresses);
    expect(selectLookupAddresses(addresses, false)).toEqual(addresses[0]);
  });

  it("validates PNG bytes and retains a safe URL filename", () => {
    validateImageBytes(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "image/png",
    );
    expect(imageFilename(new URL("https://cdn.example/assets/My-NFT.png"), "image/png")).toBe(
      "My-NFT.png",
    );
  });
});
