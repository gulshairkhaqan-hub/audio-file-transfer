"use client";

// My Library — the full history of a user's creations across all three
// features, with search, per-kind filter tabs, an inline player, and
// download / copy / open actions on each item. RecentList shows only a
// preview of this on each feature page; this is the complete view.
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type HistoryItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import AudioPlayer from "@/components/AudioPlayer";
import { KIND_ORDER, KINDS, kindMeta } from "@/lib/kinds";
import { downloadAudio, toAudioFilename } from "@/lib/download";
import { Library as LibraryIcon, Download, Trash, Search, Sparkle } from "@/components/icons";

type Filter = "all" | "clone" | "generate" | "mix";

export default function LibraryPage() {
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [deleting, setDeleting] = useState<string | null>(null); // url being deleted

  const load = useCallback(async () => {
    if (!user?.email) {
      setLoading(false);
      return;
    }
    try {
      const all = await api.history();
      setItems(all);
    } catch {
      toastError("Couldn't load your library — try refreshing.");
    } finally {
      setLoading(false);
    }
  }, [user?.email, toastError]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { clone: 0, generate: 0, mix: 0 };
    for (const it of items) if (it.kind && it.kind in c) c[it.kind] += 1;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (filter !== "all" && it.kind !== filter) return false;
      if (q && !it.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, filter, query]);

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      success("Link copied to clipboard!");
    } catch {
      toastError("Couldn't copy — please copy manually.");
    }
  }

  async function handleDelete(item: HistoryItem) {
    if (!user?.email || deleting) return;
    if (!window.confirm(`Delete "${item.name}"? This can't be undone.`)) return;
    setDeleting(item.url);
    try {
      await api.deleteFile(item.name);
      setItems((prev) => prev.filter((x) => x.url !== item.url));
      success("Deleted.");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Couldn't delete.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl fade-up">
      <PageHeading />
      <p className="mt-2 text-sm text-muted">
        Every voice you&apos;ve created — play, download, or share any of them.
      </p>

      {/* ── Search + filter tabs ── */}
      <div className="mt-8 space-y-3">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name…"
            className="field w-full rounded-lg border border-border bg-surface py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-muted/60"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Tab active={filter === "all"} onClick={() => setFilter("all")}>
            All · {items.length}
          </Tab>
          {KIND_ORDER.map((k) => {
            const { Icon, label } = KINDS[k];
            return (
              <Tab key={k} active={filter === k} onClick={() => setFilter(k)}>
                <Icon size={14} /> {label} · {counts[k]}
              </Tab>
            );
          })}
        </div>
      </div>

      {/* ── List ── */}
      <div className="mt-6">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-surface-2" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-10 text-center shadow-sm">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-accent">
              {items.length === 0 ? <Sparkle size={22} /> : <Search size={22} />}
            </span>
            <p className="mt-3 text-sm font-medium text-foreground">
              {items.length === 0 ? "Nothing here yet." : "No results match your filters."}
            </p>
            <p className="mt-1 text-xs text-muted">
              {items.length === 0
                ? "Head to a feature and create your first voice."
                : "Try a different search or filter."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => {
              const { Icon, label } = kindMeta(item.kind);
              return (
                <div
                  key={item.url}
                  className="card-hover rounded-2xl border border-border bg-surface p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                      {item.uploaded_at && (
                        <p className="text-xs text-muted">
                          {new Date(item.uploaded_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent-2">
                      <Icon size={13} /> {label}
                    </span>
                  </div>

                  <AudioPlayer src={item.url} />

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => downloadAudio(item.url, toAudioFilename(item.name))}
                      className="lift inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2"
                    >
                      <Download size={14} /> Download
                    </button>
                    <button
                      onClick={() => copyLink(item.url)}
                      className="lift rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2"
                    >
                      Copy link
                    </button>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-1 text-xs font-medium text-accent-2 hover:underline"
                    >
                      Open in new tab
                    </a>
                    <button
                      onClick={() => handleDelete(item)}
                      disabled={deleting === item.url}
                      className="lift ml-auto inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash size={14} /> {deleting === item.url ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function PageHeading() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-accent">
        <LibraryIcon size={20} />
      </span>
      <h1 className="text-2xl font-bold tracking-tight">My Library</h1>
    </div>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "gradient-accent text-white"
          : "border border-border bg-surface text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
