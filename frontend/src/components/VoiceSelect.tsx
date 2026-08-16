"use client";

// Searchable, filterable voice picker — an ElevenLabs-style combobox that
// replaces the native <select> now that we ship 28 voices. The trigger shows
// the current voice; clicking opens a panel with search + gender/accent/
// Recommended filters and a scrollable, avatar'd list. Used by Generate (one
// picker) and Mix (two, with `otherId` flagging the voice used in the other
// slot).
import { useEffect, useMemo, useRef, useState } from "react";
import { type Voice } from "@/lib/api";
import { voiceTier } from "@/lib/useVoices";
import { useFavourites } from "@/lib/favourites";
import { VoiceAvatar, HdBadge } from "@/components/VoiceAvatar";

type Gender = "all" | "female" | "male";
type Accent = "all" | "American" | "British";

export default function VoiceSelect({
  voices,
  value,
  onChange,
  loading = false,
  placeholder = "Select a voice",
  otherId,
}: {
  voices: Voice[];
  value: string;
  onChange: (id: string) => void;
  loading?: boolean;
  placeholder?: string;
  /** In mix mode, the id chosen in the other slot — flagged "in use". */
  otherId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [gender, setGender] = useState<Gender>("all");
  const [accent, setAccent] = useState<Accent>("all");
  const [recommended, setRecommended] = useState(false);
  const [favOnly, setFavOnly] = useState(false);
  const { favs, isFavourite, toggleFavourite } = useFavourites();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = voices.find((v) => v.id === value);

  // Close on outside click / Escape, and focus search when the panel opens.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => searchRef.current?.focus(), 40);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return voices.filter((v) => {
      if (favOnly && !favs.has(v.id)) return false;
      if (gender !== "all" && v.gender !== gender) return false;
      if (accent !== "all" && v.accent !== accent) return false;
      if (recommended && voiceTier(v.id) !== "premium") return false;
      if (q && !`${v.name} ${v.accent} ${v.gender}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [voices, query, gender, accent, recommended, favOnly, favs]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={rootRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => !loading && setOpen((v) => !v)}
        disabled={loading || voices.length === 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="field flex w-full items-center gap-3 rounded-xl border border-transparent bg-surface-2 px-3 py-2.5 text-left text-sm outline-none disabled:opacity-60"
      >
        {selected ? (
          <>
            <VoiceAvatar voice={selected} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-foreground">
                {selected.name}
                {voiceTier(selected.id) === "premium" && <HdBadge />}
              </span>
              <span className="block truncate text-xs text-muted">
                {selected.accent} · {selected.gender}
              </span>
            </span>
          </>
        ) : (
          <span className="flex-1 text-muted">
            {loading ? "Loading voices…" : placeholder}
          </span>
        )}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`shrink-0 text-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Panel */}
      {open && (
        <div className="fade-up absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-surface shadow-2xl backdrop-blur-md">
          <div className="border-b border-border p-2.5">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search voices…"
              className="field w-full rounded-lg border border-transparent bg-surface-2 px-3 py-2 text-sm outline-none placeholder:text-muted/50"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Chip
                active={
                  gender === "all" &&
                  accent === "all" &&
                  !recommended &&
                  !favOnly
                }
                onClick={() => {
                  setGender("all");
                  setAccent("all");
                  setRecommended(false);
                  setFavOnly(false);
                }}
              >
                All
              </Chip>
              <Chip active={favOnly} onClick={() => setFavOnly((v) => !v)}>
                ★ Favourites
              </Chip>
              <Chip active={recommended} onClick={() => setRecommended((v) => !v)}>
                ★ Recommended
              </Chip>
              <Chip
                active={gender === "female"}
                onClick={() => setGender((g) => (g === "female" ? "all" : "female"))}
              >
                Female
              </Chip>
              <Chip
                active={gender === "male"}
                onClick={() => setGender((g) => (g === "male" ? "all" : "male"))}
              >
                Male
              </Chip>
              <Chip
                active={accent === "American"}
                onClick={() =>
                  setAccent((a) => (a === "American" ? "all" : "American"))
                }
              >
                American
              </Chip>
              <Chip
                active={accent === "British"}
                onClick={() =>
                  setAccent((a) => (a === "British" ? "all" : "British"))
                }
              >
                British
              </Chip>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto p-1.5">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted">
                No voices match your filters.
              </p>
            ) : (
              filtered.map((v) => {
                const isSel = v.id === value;
                const inUse = otherId && v.id === otherId;
                const fav = isFavourite(v.id);
                return (
                  <div
                    key={v.id}
                    role="option"
                    aria-selected={isSel}
                    className={`flex w-full items-center rounded-lg pr-1 transition-colors ${
                      isSel ? "bg-accent/15" : "hover:bg-surface-2"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => pick(v.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2.5 py-2 text-left"
                    >
                      <VoiceAvatar voice={v} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {v.name}
                          {voiceTier(v.id) === "premium" && <HdBadge />}
                          {inUse && (
                            <span className="ml-2 align-middle text-[10px] uppercase tracking-wide text-muted">
                              in use
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {v.accent} · {v.gender}
                        </span>
                      </span>
                      {isSel && (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          className="shrink-0 text-accent-2"
                        >
                          <path
                            d="M20 6L9 17l-5-5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFavourite(v.id)}
                      aria-label={fav ? "Remove favourite" : "Add favourite"}
                      title={fav ? "Remove favourite" : "Add favourite"}
                      className={`shrink-0 rounded-md px-1.5 py-1 text-base leading-none transition-colors ${
                        fav
                          ? "text-yellow-400"
                          : "text-muted/50 hover:text-foreground"
                      }`}
                    >
                      {fav ? "★" : "☆"}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-border px-3 py-2 text-center text-[11px] text-muted">
            {filtered.length} of {voices.length} voices
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({
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
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "gradient-accent text-white"
          : "border border-border bg-surface-2 text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
