"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { SkillManifest } from "@agentos/sdk";

interface CatalogSkill {
  id: string;
  name: string;
  description: string;
  source: "sui-skills";
}

type Tab = "catalog" | "upload";

export interface ImportSkillDialogProps {
  /** Agent slug / SuiNS used as the publish target. */
  agentName: string;
}

export function ImportSkillDialog({ agentName }: ImportSkillDialogProps) {
  const router = useRouter();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("catalog");

  // Catalog tab state.
  const [catalog, setCatalog] = useState<CatalogSkill[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [importingId, setImportingId] = useState<string | null>(null);

  // Upload tab state.
  const [fileName, setFileName] = useState<string>("");
  const [manifest, setManifest] = useState<SkillManifest | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
    setFileError(null);
    setCatalogError(null);
    setSearch("");
    setManifest(null);
    setFileName("");
  }, []);

  // Escape-to-close + body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close]);

  // Lazily fetch the catalog the first time the dialog opens.
  useEffect(() => {
    if (!open || catalog !== null) return;
    let cancelled = false;
    void fetch("/api/skills/catalog")
      .then((res) =>
        res.ok
          ? res.json()
          : Promise.reject(new Error("Failed to load catalog")),
      )
      .then((data: { skills?: CatalogSkill[] }) => {
        if (!cancelled) setCatalog(data.skills ?? []);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setCatalog([]);
          setCatalogError(
            e instanceof Error ? e.message : "Failed to load catalog",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, catalog]);

  const importFromCatalog = async (skill: CatalogSkill) => {
    setImportingId(skill.id);
    setError(null);
    try {
      const res = await fetch("/api/skills/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentName,
          skillId: skill.id,
          name: skill.name,
          description: skill.description,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `Import failed (${res.status})`);
      }
      close();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImportingId(null);
    }
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    setManifest(null);
    const file = e.target.files?.[0];
    if (!file) {
      setFileName("");
      return;
    }
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as SkillManifest;
      if (!parsed || typeof parsed !== "object" || !parsed.name) {
        throw new Error("Not a valid skill manifest");
      }
      setManifest(parsed);
    } catch (err) {
      setFileError(
        err instanceof Error ? err.message : "Could not read manifest file",
      );
    }
  };

  const uploadManifest = async () => {
    if (!manifest) return;
    setUploading(true);
    setError(null);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentName, manifest, source: "custom" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `Upload failed (${res.status})`);
      }
      close();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const filtered = (catalog ?? []).filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q)
    );
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-2 border-pure-black bg-electric-purple px-4 py-2 font-mono text-sm font-bold text-off-white neo-shadow transition-all active:translate-x-0.5 active:translate-y-0.5"
      >
        Import Skill
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            className="absolute inset-0 bg-pure-black/40 backdrop-blur-[2px]"
            aria-hidden
          />

          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden border-2 border-pure-black bg-off-white neo-shadow-lg"
          >
            <div className="flex items-start justify-between border-b-2 border-pure-black bg-electric-purple px-6 py-4 text-off-white">
              <h2
                id={titleId}
                className="font-display text-2xl font-bold uppercase"
              >
                Import Skill
              </h2>
              <button
                type="button"
                onClick={close}
                className="border-2 border-off-white px-2 py-1 font-mono text-sm font-bold transition-colors hover:bg-off-white hover:text-pure-black"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div
              role="tablist"
              aria-label="Import source"
              className="flex shrink-0 border-b-2 border-pure-black"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === "catalog"}
                onClick={() => setTab("catalog")}
                className={`flex-1 border-r-2 border-pure-black px-3 py-3 font-mono text-xs font-bold uppercase transition-colors sm:text-sm ${
                  tab === "catalog"
                    ? "bg-soft-lavender text-pure-black"
                    : "bg-white text-on-surface-variant hover:bg-surface-container"
                }`}
              >
                From Sui Agent Skills
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "upload"}
                onClick={() => setTab("upload")}
                className={`flex-1 px-3 py-3 font-mono text-xs font-bold uppercase transition-colors sm:text-sm ${
                  tab === "upload"
                    ? "bg-soft-lavender text-pure-black"
                    : "bg-white text-on-surface-variant hover:bg-surface-container"
                }`}
              >
                Upload Manifest
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              {error && (
                <p className="mb-4 border-2 border-error bg-red-50 px-3 py-2 font-mono text-xs text-error">
                  {error}
                </p>
              )}

              {tab === "catalog" ? (
                <div className="space-y-4">
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search skills…"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full border-2 border-pure-black bg-white px-3 py-2 font-mono text-sm outline-none neo-shadow focus:neo-shadow-lg"
                  />

                  {catalogError && (
                    <p className="border-2 border-error bg-red-50 px-3 py-2 font-mono text-xs text-error">
                      {catalogError}
                    </p>
                  )}

                  {catalog === null ? (
                    <div className="space-y-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div
                          key={i}
                          aria-hidden="true"
                          className="animate-pulse border-2 border-pure-black bg-white p-4 motion-reduce:animate-none"
                        >
                          <div className="flex items-center gap-4">
                            <div className="h-8 w-8 bg-surface-container" />
                            <div className="flex-1 space-y-2">
                              <div className="h-4 w-1/2 bg-surface-container" />
                              <div className="h-3 w-1/4 bg-surface-container" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : filtered.length === 0 ? (
                    <p className="border-2 border-dashed border-pure-black py-8 text-center font-mono text-sm text-on-surface-variant">
                      No skills match your search.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {filtered.map((skill) => (
                        <li
                          key={skill.id}
                          className="flex items-start justify-between gap-3 border-2 border-pure-black bg-white p-3"
                        >
                          <div className="min-w-0">
                            <p className="font-display text-sm font-bold">
                              {skill.name}
                            </p>
                            <p className="mt-0.5 font-mono text-xs text-on-surface-variant">
                              {skill.description}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => importFromCatalog(skill)}
                            disabled={importingId !== null}
                            className="shrink-0 border-2 border-pure-black bg-electric-purple px-3 py-1.5 font-mono text-xs font-bold text-off-white transition-all active:translate-x-0.5 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {importingId === skill.id ? "Importing…" : "Import"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="font-mono text-sm text-on-surface-variant">
                    Upload a <code>sui-agent-skill/v1</code> manifest JSON file
                    to register it as a custom skill.
                  </p>

                  <label className="block">
                    <span className="mb-2 block font-mono text-xs font-bold uppercase">
                      Manifest file (.json)
                    </span>
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={onFileChange}
                      className="block w-full border-2 border-pure-black bg-white px-3 py-2 font-mono text-xs file:mr-3 file:border-2 file:border-pure-black file:bg-surface-container file:px-2 file:py-1 file:font-mono file:text-xs file:font-bold"
                    />
                  </label>

                  {fileName && !fileError && manifest && (
                    <div className="border-2 border-pure-black bg-white px-3 py-2 font-mono text-xs">
                      <p className="font-bold">{manifest.name}</p>
                      <p className="text-on-surface-variant">
                        v{manifest.version} · {manifest.publisher}
                      </p>
                    </div>
                  )}

                  {fileError && (
                    <p className="border-2 border-error bg-red-50 px-3 py-2 font-mono text-xs text-error">
                      {fileError}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={uploadManifest}
                    disabled={!manifest || uploading}
                    className="w-full border-2 border-pure-black bg-electric-purple px-4 py-3 font-mono text-sm font-bold text-off-white neo-shadow transition-all active:translate-x-0.5 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                  >
                    {uploading ? "Publishing…" : "Publish Skill"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
