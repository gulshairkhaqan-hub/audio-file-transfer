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

type Filter = "all" | "clone" | "generate" | "mix";

export default function LibraryPage() {
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    if (!user?.email) {
      setLoading(false);
      return;
    }
    try {
      const all = await api.history(user.email);
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

  return (
    <div className="mx-auto max-w-4xl fade-up">
      <h1 className="text-2xl font-semibold tracking-tight">📚 My Library</h1>
      <p className="mt-1 text-sm text-muted">
        Every voice you&apos;ve created — play, download, or share any of them.
      </p>

      {/* ── Search + filter tabs ── */}
      <div className="mt-6 space-y-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          className="field w-full rounded-xl border border-transparent bg-surface-2 px-4 py-2.5 text-sm outline-none placeholder:text-muted/50"
        />
        <div className="flex flex-wrap gap-1.5">
          <Tab active={filter === "all"} onClick={() => setFilter("all")}>
            All · {items.length}
          </Tab>
          {KIND_ORDER.map((k) => (
            <Tab key={k} active={filter === k} onClick={() => setFilter(k)}>
              {KINDS[k].icon} {KINDS[k].label} · {counts[k]}
            </Tab>
          ))}
        </div>
      </div>

      {/* ── List ── */}
      <div className="mt-6">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-2xl border border-white/5 bg-surface/60"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card-hover rounded-2xl border border-white/10 bg-surface/80 p-10 text-center shadow-2xl backdrop-blur-md">
            <div className="text-3xl">
              {items.length === 0 ? "✨" : "🔍"}
            </div>
            <p className="mt-2 text-sm text-foreground">
              {items.length === 0
                ? "Nothing here yet."
                : "No results match your filters."}
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
              const meta = kindMeta(item.kind);
              return (
                <div
                  key={item.url}
                  className="card-hover rounded-2xl border border-white/10 bg-surface/80 p-4 shadow-xl backdrop-blur-md"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.name}
                      </p>
                      {item.uploaded_at && (
                        <p className="text-xs text-muted">
                          {new Date(item.uploaded_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent-2">
                      {meta.icon} {meta.label}
                    </span>
                  </div>

                  <AudioPlayer src={item.url} />

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      onClick={() =>
                        downloadAudio(item.url, toAudioFilename(item.name))
                      }
                      className="lift rounded-xl border border-border px-3.5 py-1.5 text-xs font-medium hover:border-accent/50 hover:bg-surface-2"
                    >
                      ⬇ Download
                    </button>
                    <button
                      onClick={() => copyLink(item.url)}
                      className="lift rounded-xl border border-border px-3.5 py-1.5 text-xs font-medium hover:border-accent/50 hover:bg-surface-2"
                    >
                      Copy link
                    </button>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-accent-2 underline-offset-4 hover:underline"
                    >
                      Open in new tab
                    </a>
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
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "gradient-accent text-white"
          : "border border-border bg-surface-2 text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
