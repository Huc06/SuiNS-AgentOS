/**
 * Per-node output presentation for the workflow canvas.
 *
 * The run engine attaches a `StepResult.output` (an open `unknown` per node
 * type) to each canvas node. This module turns that raw output into:
 *   - {@link nodeOutputSummary}: a one-line human chip ("blobId abc…123",
 *     "3 skills · verified", "score 100") shown inline on a DONE node, and
 *   - {@link nodeOutputDetail}: a structured, tolerant decode used by the
 *     expandable detail popover (catalog table, objectChanges count, recall
 *     list, …) plus the raw JSON.
 *
 * Everything here is browser-safe (no Node-only imports) and shape-tolerant:
 * the executor outputs are typed `unknown`, sponsored execute may hand back
 * `objectChanges` in odd shapes, and a memory backend may embed a blobId in a
 * nested `result`. We never throw — unknown shapes degrade to a short status.
 */

// Node kinds rendered on the canvas (mirrors the SDK `WorkflowNodeType`).
export type NodeOutputType =
  | "trigger"
  | "walrus"
  | "harbor"
  | "sui"
  | "memory"
  | "memory-recall"
  | "import-agent"
  | "call-sub-agent"
  | "delegate"
  | "attest";

// ===== Explorer links (network-parameterised; the canvas passes its own) =====

type ExplorerNetwork = "mainnet" | "testnet";

export function walruscanBlobLink(blobId: string, network: ExplorerNetwork): string {
  return `https://walruscan.com/${network}/blob/${blobId}`;
}

export function suiscanTxLink(digest: string, network: ExplorerNetwork): string {
  return `https://suiscan.xyz/${network}/tx/${digest}`;
}

export function suiscanObjectLink(objectId: string, network: ExplorerNetwork): string {
  return `https://suiscan.xyz/${network}/object/${objectId}`;
}

// ===== small tolerant helpers =====

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)))
    return Number(v);
  return undefined;
}

/** Shorten an id/hash to `head…tail` for chips. */
export function shortId(id: string, head = 6, tail = 4): string {
  if (id.length <= head + tail + 1) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

/**
 * Pull a blobId out of a (possibly nested) memory/storage output. A memwal
 * `remember` response may surface the Walrus blob id at the top level or inside
 * a `result`/`data` envelope under any of a few common keys.
 */
function findBlobId(output: unknown): string | undefined {
  const keys = ["blobId", "blob_id", "blob", "id"];
  const seen = new Set<unknown>();
  const visit = (v: unknown, depth: number): string | undefined => {
    if (depth > 3 || !isRecord(v) || seen.has(v)) return undefined;
    seen.add(v);
    for (const k of keys) {
      const candidate = str(v[k]);
      // Avoid mistaking a short numeric/boolean-ish "id" for a blob; blob ids
      // are long base-ish strings. Only accept reasonably long values for `id`.
      if (candidate && (k !== "id" || candidate.length >= 20)) return candidate;
    }
    for (const nested of ["result", "data", "memory"]) {
      const found = visit(v[nested], depth + 1);
      if (found) return found;
    }
    return undefined;
  };
  return visit(output, 0);
}

/** Count `created` entries in a tx's `objectChanges` (shape-tolerant). */
function countObjectChanges(output: unknown): {
  total: number;
  created: number;
} | undefined {
  if (!isRecord(output)) return undefined;
  const changes = output.objectChanges;
  if (!Array.isArray(changes)) return undefined;
  let created = 0;
  for (const c of changes) {
    if (isRecord(c) && c.type === "created") created += 1;
  }
  return { total: changes.length, created };
}

/** Extract a recall/memories list from a memory output, if one is present. */
function findRecallList(
  output: unknown,
): Array<{ text: string; score?: number }> | undefined {
  const fromArray = (
    arr: unknown,
  ): Array<{ text: string; score?: number }> | undefined => {
    if (!Array.isArray(arr) || arr.length === 0) return undefined;
    const items: Array<{ text: string; score?: number }> = [];
    for (const it of arr) {
      if (typeof it === "string") {
        items.push({ text: it });
      } else if (isRecord(it)) {
        const text =
          str(it.text) ?? str(it.memory) ?? str(it.content) ?? str(it.value);
        if (text) items.push({ text, score: num(it.score) });
      }
    }
    return items.length > 0 ? items : undefined;
  };
  const sources: unknown[] = [];
  if (isRecord(output)) {
    sources.push(output.recall, output.memories, output.results);
    if (isRecord(output.result)) {
      sources.push(
        output.result.recall,
        output.result.memories,
        output.result.results,
      );
    }
  }
  for (const s of sources) {
    const list = fromArray(s);
    if (list) return list;
  }
  return undefined;
}

// ===== summary chip =====

/**
 * A short, human chip describing WHAT a node output. Returns `undefined` when
 * there is nothing meaningful to show (caller renders no chip).
 *
 * - walrus: `blobId head…tail`
 * - sui / call-sub-agent: `digest head…tail` (+ N obj when created changes)
 * - import-agent: `N skills · verified|partial`
 * - delegate: `cap head…tail` (or `granted` when the cap id is unknown)
 * - attest: `score N`
 * - memory: `ns · blobId head…tail` (NOT "queued")
 * - harbor: `sealed` / `public (skipped)`
 * - trigger: `started`
 */
export function nodeOutputSummary(
  type: NodeOutputType,
  output: unknown,
): string | undefined {
  switch (type) {
    case "trigger":
      return "started";

    case "walrus": {
      const blobId = findBlobId(output);
      return blobId ? `blob ${shortId(blobId)}` : "stored";
    }

    case "harbor": {
      if (isRecord(output)) {
        if (str(output.note)) return "public (skipped)";
        const blobId = findBlobId(output);
        return blobId ? `sealed ${shortId(blobId)}` : "sealed";
      }
      return "sealed";
    }

    case "sui": {
      if (isRecord(output) && str(output.note)) return "no-op";
      const digest = isRecord(output) ? str(output.digest) : undefined;
      const changes = countObjectChanges(output);
      if (digest) {
        return changes && changes.created > 0
          ? `tx ${shortId(digest)} · ${changes.created} obj`
          : `tx ${shortId(digest)}`;
      }
      return "executed";
    }

    case "memory": {
      if (isRecord(output) && str(output.note)) return "skipped";
      const ns = isRecord(output) ? str(output.namespace) : undefined;
      const blobId = findBlobId(output);
      if (ns && blobId) return `${ns} · ${shortId(blobId)}`;
      if (ns) return `ns ${ns}`;
      if (blobId) return `blob ${shortId(blobId)}`;
      return "remembered";
    }

    case "memory-recall": {
      if (isRecord(output) && str(output.note)) return "skipped";
      const total = isRecord(output) ? num(output.total) : undefined;
      const list = findRecallList(output);
      const n = total ?? list?.length ?? 0;
      return n === 1 ? "1 recalled" : `${n} recalled`;
    }

    case "import-agent": {
      if (!isRecord(output)) return "imported";
      const count = num(output.skillCount);
      const catalog = Array.isArray(output.catalog)
        ? output.catalog
        : undefined;
      const n = count ?? catalog?.length ?? 0;
      const allVerified =
        catalog?.every((c) => isRecord(c) && c.verified === true) ?? true;
      const label = n === 1 ? "skill" : "skills";
      return `${n} ${label} · ${allVerified ? "verified" : "partial"}`;
    }

    case "delegate": {
      const capId = isRecord(output) ? str(output.capId) : undefined;
      return capId ? `cap ${shortId(capId)}` : "granted";
    }

    case "call-sub-agent": {
      const digest = isRecord(output) ? str(output.digest) : undefined;
      const delegated = isRecord(output) && output.delegated === true;
      if (digest)
        return delegated ? `tx ${shortId(digest)} · deleg` : `tx ${shortId(digest)}`;
      return "called";
    }

    case "attest": {
      const score = isRecord(output) ? num(output.score) : undefined;
      return score !== undefined ? `score ${score}` : "attested";
    }

    default:
      return undefined;
  }
}

// ===== structured detail (for the expandable popover) =====

/** A labelled key/value field rendered as a row in the detail popover. */
export interface DetailField {
  label: string;
  value: string;
  /** When set, render the value as an explorer link of this kind. */
  link?: { kind: "tx" | "object" | "blob"; ref: string };
  mono?: boolean;
}

/** One row of an import-agent skill catalog. */
export interface CatalogRow {
  name: string;
  version: string;
  verified: boolean;
  requiredCapabilities: string[];
  error?: string;
}

/** One recalled memory (when a memory output carries a recall list). */
export interface RecallRow {
  text: string;
  score?: number;
}

/**
 * Structured, tolerant decode of a node output for the expandable detail view.
 * `fields` always renders; `catalog`/`objectChanges`/`recall` are populated
 * only for the node types that produce them.
 */
export interface NodeOutputDetail {
  fields: DetailField[];
  catalog?: CatalogRow[];
  objectChanges?: { total: number; created: number };
  recall?: RecallRow[];
}

export function nodeOutputDetail(
  type: NodeOutputType,
  output: unknown,
): NodeOutputDetail {
  const fields: DetailField[] = [];
  const detail: NodeOutputDetail = { fields };
  const rec = isRecord(output) ? output : undefined;

  const pushBlob = () => {
    const blobId = findBlobId(output);
    if (blobId)
      fields.push({
        label: "blob",
        value: blobId,
        link: { kind: "blob", ref: blobId },
        mono: true,
      });
  };
  const pushDigest = () => {
    const digest = str(rec?.digest);
    if (digest)
      fields.push({
        label: "tx",
        value: digest,
        link: { kind: "tx", ref: digest },
        mono: true,
      });
  };

  switch (type) {
    case "trigger": {
      fields.push({ label: "status", value: "started" });
      break;
    }

    case "walrus": {
      pushBlob();
      break;
    }

    case "harbor": {
      if (rec && str(rec.note)) {
        fields.push({ label: "seal", value: "public — skipped" });
        break;
      }
      fields.push({ label: "seal", value: "encrypted" });
      const policy = str(rec?.sealPolicyId);
      if (policy)
        fields.push({ label: "policy", value: policy, mono: true });
      const bytes = num(rec?.encryptedBytes);
      if (bytes !== undefined)
        fields.push({ label: "bytes", value: String(bytes) });
      // When the bytes landed in the user's REAL Harbor account, show where.
      if (str(rec?.storage) === "harbor") {
        fields.push({ label: "storage", value: "harbor" });
        const url = str(rec?.url);
        if (url) fields.push({ label: "url", value: url });
      }
      pushBlob();
      break;
    }

    case "sui": {
      if (rec && str(rec.note)) {
        fields.push({ label: "note", value: str(rec.note) as string });
        break;
      }
      pushDigest();
      detail.objectChanges = countObjectChanges(output);
      if (detail.objectChanges)
        fields.push({
          label: "objectChanges",
          value: `${detail.objectChanges.created} created / ${detail.objectChanges.total} total`,
        });
      break;
    }

    case "memory": {
      if (rec && str(rec.note)) {
        fields.push({ label: "note", value: str(rec.note) as string });
        break;
      }
      const ns = str(rec?.namespace);
      if (ns) fields.push({ label: "namespace", value: ns });
      pushBlob();
      detail.recall = findRecallList(output);
      break;
    }

    case "memory-recall": {
      if (rec && str(rec.note)) {
        fields.push({ label: "note", value: str(rec.note) as string });
        break;
      }
      const ns = str(rec?.namespace);
      if (ns) fields.push({ label: "namespace", value: ns });
      const query = str(rec?.query);
      if (query) fields.push({ label: "query", value: query });
      detail.recall = findRecallList(output);
      fields.push({
        label: "matches",
        value: String(num(rec?.total) ?? detail.recall?.length ?? 0),
      });
      break;
    }

    case "import-agent": {
      const agent = str(rec?.agent);
      if (agent) fields.push({ label: "agent", value: agent });
      const passportId = str(rec?.passportId);
      if (passportId)
        fields.push({
          label: "passport",
          value: passportId,
          link: { kind: "object", ref: passportId },
          mono: true,
        });
      const count = num(rec?.skillCount);
      const catalogRaw = Array.isArray(rec?.catalog) ? rec.catalog : [];
      fields.push({
        label: "skills",
        value: String(count ?? catalogRaw.length),
      });
      detail.catalog = catalogRaw.map((c): CatalogRow => {
        const r = isRecord(c) ? c : {};
        return {
          name: str(r.name) ?? str(r.skillId) ?? "(unnamed)",
          version: str(r.version) ?? "",
          verified: r.verified === true,
          requiredCapabilities: Array.isArray(r.requiredCapabilities)
            ? r.requiredCapabilities.filter(
                (x): x is string => typeof x === "string",
              )
            : [],
          error: str(r.error),
        };
      });
      break;
    }

    case "delegate": {
      pushDigest();
      const capId = str(rec?.capId);
      if (capId)
        fields.push({
          label: "cap",
          value: capId,
          link: { kind: "object", ref: capId },
          mono: true,
        });
      const child = str(rec?.childAgent);
      if (child) fields.push({ label: "child", value: child });
      break;
    }

    case "call-sub-agent": {
      pushDigest();
      const skill = str(rec?.skill);
      if (skill) fields.push({ label: "skill", value: skill });
      if (rec && typeof rec.verified === "boolean")
        fields.push({ label: "verified", value: rec.verified ? "yes" : "no" });
      if (rec && typeof rec.delegated === "boolean")
        fields.push({
          label: "delegated",
          value: rec.delegated ? "yes" : "no",
        });
      const hash = str(rec?.manifestHash);
      if (hash) fields.push({ label: "manifestHash", value: hash, mono: true });
      break;
    }

    case "attest": {
      pushDigest();
      const score = num(rec?.score);
      if (score !== undefined)
        fields.push({ label: "score", value: String(score) });
      const kind = str(rec?.kind);
      if (kind) fields.push({ label: "kind", value: kind });
      const subject = str(rec?.subjectPassportId);
      if (subject)
        fields.push({
          label: "subject",
          value: subject,
          link: { kind: "object", ref: subject },
          mono: true,
        });
      if (rec && rec.shared === true)
        fields.push({ label: "shared", value: "yes" });
      const recipient = str(rec?.recipient);
      if (recipient) fields.push({ label: "recipient", value: recipient });
      break;
    }
  }

  return detail;
}
