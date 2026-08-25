"use client";

// Floating pill navigation for the studio — replaces the old sidebar.
// A single rounded-full bar, centered at the top, that *contracts* on scroll:
// padding shrinks and the link labels collapse to icons. Done with a scroll
// listener + CSS transitions (no animation dependency); respects reduced motion
// via Tailwind's `motion-reduce` variant. Account actions (Settings, Log out)
// live in the avatar menu on the right.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { useAuth } from "@/lib/auth";
import Logo from "@/components/Logo";
import {
  Home,
  Mic,
  Waveform,
  Sliders,
  Grid,
  Library,
  Settings,
  LogOut,
} from "@/components/icons";

type IconProps = { size?: number; className?: string };

const NAV: { href: string; label: string; Icon: ComponentType<IconProps> }[] = [
  { href: "/studio", label: "Dashboard", Icon: Home },
  { href: "/studio/clone", label: "Cloning", Icon: Mic },
  { href: "/studio/generate", label: "Generation", Icon: Waveform },
  { href: "/studio/mix", label: "Mixing", Icon: Sliders },
  { href: "/studio/voices", label: "Voices", Icon: Grid },
  { href: "/studio/library", label: "Library", Icon: Library },
];

export default function StudioNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Contract once the page has scrolled a touch.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the account menu on outside click, Escape, or navigation.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => setMenuOpen(false), [pathname]);

  const initial = (user?.name || user?.email || "?").charAt(0).toUpperCase();

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4">
      <nav
        aria-label="Primary"
        className={`pointer-events-auto flex max-w-[calc(100vw-2rem)] items-center gap-1 rounded-full border border-border bg-surface/85 backdrop-blur-md transition-all duration-300 ease-out motion-reduce:transition-none ${
          scrolled
            ? "mt-2.5 px-1.5 py-1.5 shadow-[0_12px_30px_-14px_rgba(11,11,15,0.30)]"
            : "mt-4 px-2.5 py-2 shadow-[0_4px_18px_-12px_rgba(11,11,15,0.18)]"
        }`}
      >
        <Link
          href="/studio"
          aria-label="VoxClone home"
          className="mr-0.5 flex shrink-0 items-center pl-1.5"
        >
          <Logo mark className="h-6 w-auto" />
        </Link>

        {NAV.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              title={label}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center rounded-full px-2.5 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-foreground text-white"
                  : "text-muted hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              <Icon size={18} className="shrink-0" />
              {/* Label collapses to zero width when the pill contracts. */}
              <span
                className={`hidden overflow-hidden whitespace-nowrap transition-all duration-300 ease-out motion-reduce:transition-none md:inline-block ${
                  scrolled ? "ml-0 max-w-0 opacity-0" : "ml-2 max-w-[8rem] opacity-100"
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}

        {/* Account menu */}
        <div ref={menuRef} className="relative ml-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Account menu"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-white"
          >
            {initial}
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="fade-up absolute right-0 top-full mt-2 w-60 origin-top-right overflow-hidden rounded-2xl border border-border bg-surface p-1.5 shadow-lg"
            >
              <div className="px-3 py-2">
                <p className="truncate text-sm font-medium text-foreground">
                  {user?.name || "—"}
                </p>
                <p className="truncate text-xs text-muted">{user?.email || ""}</p>
              </div>
              <div className="my-1 h-px bg-border" />
              <Link
                href="/studio/settings"
                role="menuitem"
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <Settings size={16} /> Settings
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  logout();
                  router.replace("/login");
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
              >
                <LogOut size={16} /> Log out
              </button>
            </div>
          )}
        </div>
      </nav>
    </div>
  );
}
