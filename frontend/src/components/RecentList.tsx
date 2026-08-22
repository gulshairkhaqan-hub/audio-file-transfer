"use client";

// Shared "Recent" list of a user's generated audio, used by all three studio
// features. Pass `kind` to show only that feature's output.
import { useCallback, useEffect, useState } from "react";
import { api, type HistoryItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";

export type RecentListHandle = { reload: () => void };

export default function RecentList({
  kind,
  reloadKey = 0,
  limit = 5,
}: {
  /** Filter to one feature's output. Omit to show everything. */
  kind?: string;
  /** Bump this to trigger a reload after generating something new. */
  reloadKey?: number;
  limit?: number;
}) {
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const [items, setItems] = useState<HistoryItem[]>([]);

  const load = useCallback(async () => {
    if (!user?.email) return;
    try {
      const all = await api.history();
      // Records created before `kind` was tracked have no kind — keep them
      // only in the unfiltered view so nothing silently disappears.
      setItems(kind ? all.filter((i) => i.kind === kind) : all);
    } catch {
      // history is non-critical — silently skip if it fails
    }
  }, [user?.email, kind]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      success("Link copied to clipboard!");
    } catch {
      toastError("Couldn't copy — please copy manually.");
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted">
        Recent
      </h2>
      <div className="space-y-2">
        {items.slice(0, limit).map((item) => (
          <div
            key={item.url}
            className="lift flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-surface/60 px-4 py-3 backdrop-blur-sm hover:border-accent/30"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">{item.name}</p>
              {item.uploaded_at && (
                <p className="text-xs text-muted">
                  {new Date(item.uploaded_at).toLocaleString()}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent-2 underline-offset-4 hover:underline"
              >
                Open
              </a>
              <button
                onClick={() => copyLink(item.url)}
                className="text-xs text-muted hover:text-foreground"
              >
                Copy
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
