"use client";

// Studio home — a real dashboard (was previously just a redirect to /clone).
// Greets the user, summarises their activity, offers quick-action cards for
// the three features, and shows their most recent creations with a link into
// the full Library.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, type HistoryItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { KIND_ORDER, KINDS, kindMeta } from "@/lib/kinds";

export default function DashboardPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.email) {
        setLoading(false);
        return;
      }
      try {
        const all = await api.history(user.email);
        if (!cancelled) setItems(all);
      } catch {
        // history is non-critical — an empty dashboard is fine
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { clone: 0, generate: 0, mix: 0 };
    for (const it of items) if (it.kind && it.kind in c) c[it.kind] += 1;
    return c;
  }, [items]);

  const recent = items.slice(0, 5);
  const firstName = (user?.name || "there").split(" ")[0];

  return (
    <div className="mx-auto max-w-5xl fade-up">
      {/* ── Greeting ── */}
      <h1 className="text-2xl font-semibold tracking-tight">
        Welcome back, <span className="gradient-text">{firstName}</span> 👋
      </h1>
      <p className="mt-1 text-sm text-muted">
        Create studio-quality speech — clone a voice, generate from 28 presets,
        or blend two into something new.
      </p>

      {/* ── Stats strip ── */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total creations" value={items.length} icon="🎵" big />
        {KIND_ORDER.map((k) => (
          <StatCard
            key={k}
            label={KINDS[k].label}
            value={counts[k]}
            icon={KINDS[k].icon}
          />
        ))}
      </div>

      {/* ── Quick actions ── */}
      <h2 className="mb-3 mt-9 text-sm font-semibold uppercase tracking-widest text-muted">
        Start creating
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <ActionCard
          href={KINDS.clone.href}
          icon={KINDS.clone.icon}
          title="Clone a voice"
          desc="Upload a ~20s sample and make it say anything."
        />
        <ActionCard
          href={KINDS.generate.href}
          icon={KINDS.generate.icon}
          title="Generate speech"
          desc="Pick from 28 preset voices and type your script."
        />
        <ActionCard
          href={KINDS.mix.href}
          icon={KINDS.mix.icon}
          title="Mix two voices"
          desc="Blend two voices into a brand-new one."
        />
      </div>

      {/* ── Recent creations ── */}
      <div className="mb-3 mt-9 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">
          Recent creations
        </h2>
        {items.length > 0 && (
          <Link
            href="/studio/library"
            className="text-xs text-accent-2 underline-offset-4 hover:underline"
          >
            View all in Library →
          </Link>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-xl border border-white/5 bg-surface/60"
            />
          ))}
        </div>
      ) : recent.length === 0 ? (
        <div className="card-hover rounded-2xl border border-white/10 bg-surface/80 p-8 text-center shadow-2xl backdrop-blur-md">
          <div className="text-3xl">✨</div>
          <p className="mt-2 text-sm text-foreground">No creations yet.</p>
          <p className="mt-1 text-xs text-muted">
            Your generated audio will show up here.
          </p>
          <Link
            href={KINDS.clone.href}
            className="lift sheen gradient-accent mt-4 inline-flex rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_var(--accent-glow)]"
          >
            Create your first voice
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {recent.map((item) => {
            const meta = kindMeta(item.kind);
            return (
              <div
                key={item.url}
                className="lift flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-surface/60 px-4 py-3 backdrop-blur-sm hover:border-accent/30"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="text-lg">{meta.icon}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">
                      {item.name}
                    </p>
                    <p className="text-xs text-muted">
                      {meta.label}
                      {item.uploaded_at &&
                        ` · ${new Date(item.uploaded_at).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs text-accent-2 underline-offset-4 hover:underline"
                >
                  Open
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  big = false,
}: {
  label: string;
  value: number;
  icon: string;
  big?: boolean;
}) {
  return (
    <div
      className={`card-hover rounded-2xl border border-white/10 p-4 shadow-xl backdrop-blur-md ${
        big ? "gradient-accent text-white" : "bg-surface/80"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-xs ${big ? "text-white/80" : "text-muted"}`}>
          {label}
        </span>
        <span className="text-base">{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function ActionCard({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="card-hover group flex flex-col rounded-2xl border border-white/10 bg-surface/80 p-5 shadow-xl backdrop-blur-md"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-xl">
        {icon}
      </span>
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 flex-1 text-xs text-muted">{desc}</p>
      <span className="mt-3 text-xs font-medium text-accent-2">
        Open →
      </span>
    </Link>
  );
}
