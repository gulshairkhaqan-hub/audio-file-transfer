"use client";

// Studio home — a real dashboard. Greets the user, summarises their activity,
// offers quick-action cards for the three features, and shows their most recent
// creations with a link into the full Library.
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type HistoryItem } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { KIND_ORDER, KINDS, kindMeta } from "@/lib/kinds";
import { Waveform, Sparkle, ArrowRight } from "@/components/icons";

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
        const all = await api.history();
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
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        Welcome back, <span className="gradient-text">{firstName}</span>
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Create studio-quality speech — clone a voice, generate from 28 presets,
        or blend two into something new.
      </p>

      {/* ── Stats strip ── */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total creations" value={items.length} icon={<Waveform size={18} />} big />
        {KIND_ORDER.map((k) => {
          const { Icon, label } = KINDS[k];
          return (
            <StatCard key={k} label={label} value={counts[k]} icon={<Icon size={18} />} />
          );
        })}
      </div>

      {/* ── Quick actions ── */}
      <h2 className="mb-3 mt-10 text-xs font-semibold uppercase tracking-widest text-muted">
        Start creating
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <ActionCard
          href={KINDS.clone.href}
          icon={<KINDS.clone.Icon size={20} />}
          title="Clone a voice"
          desc="Upload a ~20s sample and make it say anything."
        />
        <ActionCard
          href={KINDS.generate.href}
          icon={<KINDS.generate.Icon size={20} />}
          title="Generate speech"
          desc="Pick from 28 preset voices and type your script."
        />
        <ActionCard
          href={KINDS.mix.href}
          icon={<KINDS.mix.Icon size={20} />}
          title="Mix two voices"
          desc="Blend two voices into a brand-new one."
        />
      </div>

      {/* ── Recent creations ── */}
      <div className="mb-3 mt-10 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">
          Recent creations
        </h2>
        {items.length > 0 && (
          <Link
            href="/studio/library"
            className="inline-flex items-center gap-1 text-xs font-medium text-accent-2 hover:underline"
          >
            View all <ArrowRight size={13} />
          </Link>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border border-border bg-surface-2" />
          ))}
        </div>
      ) : recent.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-10 text-center shadow-sm">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-accent">
            <Sparkle size={22} />
          </span>
          <p className="mt-3 text-sm font-medium text-foreground">No creations yet.</p>
          <p className="mt-1 text-xs text-muted">Your generated audio will show up here.</p>
          <Link
            href={KINDS.clone.href}
            className="lift gradient-accent mt-5 inline-flex rounded-lg px-5 py-2.5 text-sm font-semibold text-white"
          >
            Create your first voice
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {recent.map((item) => {
            const { Icon, label } = kindMeta(item.kind);
            return (
              <div
                key={item.url}
                className="lift flex items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                    <Icon size={17} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted">
                      {label}
                      {item.uploaded_at &&
                        ` · ${new Date(item.uploaded_at).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs font-medium text-accent-2 hover:underline"
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
  icon: ReactNode;
  big?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        big ? "gradient-accent border-transparent text-white" : "border-border bg-surface"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-xs ${big ? "text-white/70" : "text-muted"}`}>{label}</span>
        <span className={big ? "text-white/80" : "text-muted"}>{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight">{value}</div>
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
  icon: ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="card-hover lift group flex flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-accent">
        {icon}
      </span>
      <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1 flex-1 text-xs leading-relaxed text-muted">{desc}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-accent-2">
        Open <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
