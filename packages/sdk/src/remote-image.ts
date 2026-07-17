import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { IncomingMessage } from "node:http";

/** Maximum accepted remote image size (10 MiB). */
export const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;

export type RemoteImageContentType = "image/jpeg" | "image/png";

export interface RemoteImage {
  bytes: Uint8Array;
  filename: string;
  contentType: RemoteImageContentType;
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type HostnameResolver = (
  hostname: string,
) => Promise<ResolvedAddress[]>;

export interface FetchRemoteImageOptions {
  /** Test seam; production defaults to Node DNS lookup with all records. */
  resolveHostname?: HostnameResolver;
  maxBytes?: number;
  timeoutMs?: number;
}

/**
 * Download a JPEG/PNG for server-side Harbor archival without letting a workflow
 * turn the server into an SSRF proxy. URLs must be HTTPS public hosts, are
 * revalidated on every redirect, and DNS results are pinned through the request
 * lookup callback before a connection is made.
 */
export async function fetchRemoteImage(
  rawUrl: string,
  options: FetchRemoteImageOptions = {},
): Promise<RemoteImage> {
  const resolveHostname = options.resolveHostname ?? resolvePublicHostname;
  const maxBytes = options.maxBytes ?? MAX_REMOTE_IMAGE_BYTES;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  let target = validateRemoteImageUrl(rawUrl);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    // Validate before connecting so literal IPs and DNS records fail early.
    await assertPublicTarget(target, resolveHostname);
    const response = await requestRemoteImage(target, {
      maxBytes,
      timeoutMs,
      resolveHostname,
    });
    const statusCode = response.statusCode ?? 0;

    if (isRedirect(statusCode)) {
      const location = firstHeader(response.headers.location);
      response.resume();
      if (!location) throw new Error("Image URL redirect did not include a Location header");
      if (redirects === MAX_REDIRECTS) {
        throw new Error(`Image URL exceeded the ${MAX_REDIRECTS}-redirect limit`);
      }
      target = validateRemoteImageUrl(new URL(location, target).toString());
      continue;
    }

    if (statusCode < 200 || statusCode >= 300) {
      response.resume();
      throw new Error(`Image URL returned HTTP ${statusCode}`);
    }

    let contentType: RemoteImageContentType;
    try {
      contentType = validateImageResponseHeaders(
        response.headers["content-type"],
        response.headers["content-length"],
        maxBytes,
      );
    } catch (error) {
      response.resume();
      throw error;
    }

    const bytes = await readRemoteImageBody(response, maxBytes);
    validateImageBytes(bytes, contentType);
    return {
      bytes,
      filename: imageFilename(target, contentType),
      contentType,
    };
  }

  throw new Error("Image URL could not be resolved");
}

/** Parse and immediately reject URL forms that are unsafe without DNS. */
export function validateRemoteImageUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("Image URL must be a valid absolute HTTPS URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("Image URL must use HTTPS");
  }
  if (url.username || url.password) {
    throw new Error("Image URL must not include credentials");
  }
  if (url.port && url.port !== "443") {
    throw new Error("Image URL must use the default HTTPS port");
  }
  if (!url.hostname || isBlockedHostname(url.hostname)) {
    throw new Error("Image URL host must be a public address");
  }
  return url;
}

/** Resolve every DNS record and reject any private/loopback/link-local result. */
export async function resolvePublicHostname(
  hostname: string,
): Promise<ResolvedAddress[]> {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  const addresses = records.map((record) => ({
    address: record.address,
    family: record.family === 6 ? 6 : 4,
  })) as ResolvedAddress[];
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error("Image URL host must resolve exclusively to public IP addresses");
  }
  return addresses;
}

/** True only for publicly routable IPv4/IPv6 addresses accepted by this fetcher. */
export function isPublicIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      a >= 224
    );
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    return !(
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith("ff") ||
      normalized.startsWith("::ffff:127.") ||
      normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:192.168.") ||
      /^::ffff:172\.(1[6-9]|2\d|3[01])\./.test(normalized)
    );
  }
  return false;
}

/** Validate JPEG/PNG magic bytes after MIME validation. */
export function validateImageBytes(
  bytes: Uint8Array,
  contentType: RemoteImageContentType,
): void {
  const png =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const jpeg =
    bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if ((contentType === "image/png" && !png) || (contentType === "image/jpeg" && !jpeg)) {
    throw new Error(`Image URL body does not match declared ${contentType} content`);
  }
}

/** Preserve a safe matching URL filename; generate one from the verified MIME otherwise. */
export function imageFilename(url: URL, contentType: RemoteImageContentType): string {
  const extension = contentType === "image/png" ? ".png" : ".jpg";
  const expected = contentType === "image/png" ? /\.png$/i : /\.jpe?g$/i;
  const raw = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
  if (
    raw.length > 0 &&
    raw.length <= 128 &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(raw) &&
    expected.test(raw)
  ) {
    return raw;
  }
  return `asset-${Date.now()}${extension}`;
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    isIP(normalized) !== 0 && !isPublicIpAddress(normalized)
  );
}

async function assertPublicTarget(
  url: URL,
  resolveHostname: HostnameResolver,
): Promise<void> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname) !== 0) {
    if (!isPublicIpAddress(hostname)) {
      throw new Error("Image URL host must be a public address");
    }
    return;
  }
  const addresses = await resolveHostname(hostname);
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIpAddress(address))) {
    throw new Error("Image URL host must resolve exclusively to public IP addresses");
  }
}

type NodeLookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | ResolvedAddress[],
  family?: number,
) => void;

/** Return the exact DNS result shape Node expects for lookup all/single mode. */
export function selectLookupAddresses(
  addresses: ResolvedAddress[],
  all: true,
): ResolvedAddress[];
export function selectLookupAddresses(
  addresses: ResolvedAddress[],
  all: false,
): ResolvedAddress;
export function selectLookupAddresses(
  addresses: ResolvedAddress[],
  all: boolean,
): ResolvedAddress | ResolvedAddress[] {
  if (addresses.length === 0) {
    throw new Error("Image URL host did not resolve");
  }
  return all ? addresses : addresses[0]!;
}

async function requestRemoteImage(
  url: URL,
  options: Required<Pick<FetchRemoteImageOptions, "maxBytes" | "timeoutMs">> & {
    resolveHostname: HostnameResolver;
  },
): Promise<IncomingMessage> {
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        headers: {
          accept: "image/jpeg,image/png",
          "user-agent": "AgentOS-Harbor-Media/1.0",
        },
        lookup: (hostname, lookupOptions, callback) => {
          const wantsAll = lookupOptions.all === true;
          const respond = callback as unknown as NodeLookupCallback;
          options.resolveHostname(hostname).then(
            (addresses) => {
              if (wantsAll) {
                respond(null, selectLookupAddresses(addresses, true));
                return;
              }
              const address = selectLookupAddresses(addresses, false);
              respond(null, address.address, address.family);
            },
            (error: unknown) => {
              const lookupError = error as NodeJS.ErrnoException;
              respond(lookupError, wantsAll ? [] : "", wantsAll ? undefined : 0);
            },
          );
        },
      },
      resolve,
    );
    req.setTimeout(options.timeoutMs, () => {
      req.destroy(new Error("Image URL request timed out"));
    });
    req.on("error", reject);
    req.end();
  });
}

export function validateImageResponseHeaders(
  contentTypeHeader: string | string[] | undefined,
  contentLengthHeader: string | string[] | undefined,
  maxBytes = MAX_REMOTE_IMAGE_BYTES,
): RemoteImageContentType {
  const contentType = parseImageContentType(contentTypeHeader);
  if (!contentType) {
    throw new Error("Image URL must respond with image/jpeg or image/png");
  }
  const declaredLength = parseContentLength(contentLengthHeader);
  if (declaredLength !== undefined && declaredLength > maxBytes) {
    throw new Error(`Image URL exceeds the ${maxBytes}-byte limit`);
  }
  return contentType;
}

/** Read a response incrementally so a missing/malicious Content-Length cannot exhaust memory. */
export async function readRemoteImageBody(
  response: AsyncIterable<Uint8Array> & { destroy?: () => void },
  maxBytes = MAX_REMOTE_IMAGE_BYTES,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for await (const chunk of response) {
      const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      total += bytes.length;
      if (total > maxBytes) {
        response.destroy?.();
        throw new Error(`Image URL exceeds the ${maxBytes}-byte limit`);
      }
      chunks.push(bytes);
    }
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function parseImageContentType(header: string | string[] | undefined): RemoteImageContentType | undefined {
  const value = firstHeader(header)?.split(";", 1)[0]?.trim().toLowerCase();
  return value === "image/jpeg" || value === "image/png" ? value : undefined;
}

function parseContentLength(header: string | string[] | undefined): number | undefined {
  const raw = firstHeader(header);
  if (!raw) return undefined;
  const length = Number(raw);
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new Error("Image URL returned an invalid Content-Length");
  }
  return length;
}

function firstHeader(header: string | string[] | undefined): string | undefined {
  return Array.isArray(header) ? header[0] : header;
}

function isRedirect(statusCode: number): boolean {
  return statusCode >= 300 && statusCode < 400;
}
