"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/Logo";

// Sidebar nav items for the 3 features.
const NAV = [
  { href: "/studio/clone", label: "Voice Cloning", icon: "🎙️" },
  { href: "/studio/generate", label: "Voice Generation", icon: "🔊" },
  { href: "/studio/mix", label: "Voice Mixing", icon: "🎛️" },
];

export default function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(true); // sidebar open/closed (hamburger toggle)

  // Protected: redirect to login if not authenticated.
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Sidebar (collapsible) ── */}
      <aside
        className={`flex shrink-0 flex-col overflow-hidden border-r border-border bg-surface transition-all duration-300 ${
          open ? "w-64" : "w-0 border-r-0"
        }`}
      >
        <div className="flex w-64 items-center justify-center px-6 py-5">
          <Logo className="h-11 w-auto" />
        </div>

        <nav className="w-64 flex-1 space-y-1 p-3">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-tab flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
                  active
                    ? "gradient-accent text-white shadow-[0_0_16px_var(--accent-glow)]"
                    : "text-muted hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="w-64 border-t border-border p-4">
          <div className="mb-3 truncate text-sm text-foreground">
            👤 {user.name}
          </div>
          <button
            onClick={() => {
              logout();
              router.replace("/login");
            }}
            className="lift sheen gradient-accent w-full rounded-xl py-2.5 text-sm font-medium text-white shadow-[0_0_12px_var(--accent-glow)] hover:shadow-[0_0_22px_var(--accent-glow)]"
          >
            Log out
          </button>
        </div>
      </aside>

      {/* ── Main column: top bar (hamburger) + content ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center px-4 py-2.5">
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-foreground"
          >
            {/* Hamburger — 3 parallel lines */}
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </header>

        <main className="flex-1 overflow-y-auto px-8 py-6">{children}</main>
      </div>
    </div>
  );
}
