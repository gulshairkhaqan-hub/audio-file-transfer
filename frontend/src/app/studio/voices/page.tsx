"use client";

// Voice Library — browse every preset voice as a gallery, with search and
// gender / accent / recommended filters. "Use in Generate" stashes the chosen
// id in localStorage and jumps to the Generate page, which picks it up on
// mount. This is the "scroll and pick your own" view the user asked for.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useVoices, voiceTier } from "@/lib/useVoices";
import { useFavourites } from "@/lib/favourites";
import { VoicePhotoBanner, HdBadge } from "@/components/VoiceAvatar";

export const PICK_VOICE_KEY = "voxclone_pick_voice";

type Gender = "all" | "female" | "male";

export default function VoicesPage() {
  const router = useRouter();
  const { voices, loading, error } = useVoices();
  const { isFavourite, toggleFavourite } = useFavourites();
  const [query, setQuery] = useState("");
  const [gender, setGender] = useState<Gender>("all");
  const [accent, setAccent] = useState<string>("all");
  const [recommended, setRecommended] = useState(false);
  const [favOnly, setFavOnly] = useState(false);

  // Accent chips are derived from the loaded voices, so new languages appear
  // automatically without touching this file.
  const accents = useMemo(() => {
    const seen = new Set(voices.map((v) => v.accent).filter(Boolean));
    return Array.from(seen).sort();
  }, [voices]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return voices.filter((v) => {
      if (favOnly && !isFavourite(v.id)) return false;
      if (gender !== "all" && v.gender !== gender) return false;
      if (accent !== "all" && v.accent !== accent) return false;
      if (recommended && voiceTier(v.id) !== "premium") return false;
      if (q && !`${v.name} ${v.accent} ${v.gender}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [voices, query, gender, accent, recommended, favOnly, isFavourite]);

  function selectVoice(id: string) {
    try {
      localStorage.setItem(PICK_VOICE_KEY, id);
    } catch {
      // non-fatal — user can still pick manually on the Generate page
    }
    router.push("/studio/generate");
  }

  return (
    <div className="mx-auto max-w-5xl fade-up">
      <h1 className="text-2xl font-semibold tracking-tight">🎭 Voice Library</h1>
      <p className="mt-1 text-sm text-muted">
        {voices.length > 0 ? `${voices.length} ` : ""}studio voices across
        multiple languages and accents. Preview the vibe, then use one in
        Generate.
      </p>

      {/* ── Search + filter chips ── */}
      <div className="mt-6 space-y-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search voices…"
          className="field w-full rounded-xl border border-transparent bg-surface-2 px-4 py-2.5 text-sm outline-none placeholder:text-muted/50"
        />
        <div className="flex flex-wrap gap-1.5">
          <Chip
            active={
              gender === "all" && accent === "all" && !recommended && !favOnly
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
          {accents.map((a) => (
            <Chip
              key={a}
              active={accent === a}
              onClick={() => setAccent((cur) => (cur === a ? "all" : a))}
            >
              {a}
            </Chip>
          ))}
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="mt-6">
        {error ? (
          <div className="card-hover rounded-2xl border border-white/10 bg-surface/80 p-8 text-center shadow-2xl backdrop-blur-md">
            <p className="text-sm text-muted">
              Couldn&apos;t load voices — the backend may be starting up.
              Refresh in a minute.
            </p>
          </div>
        ) : loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-2xl border border-white/5 bg-surface/60"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card-hover rounded-2xl border border-white/10 bg-surface/80 p-10 text-center shadow-2xl backdrop-blur-md">
            <div className="text-3xl">🔍</div>
            <p className="mt-2 text-sm text-foreground">
              No voices match your filters.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((v) => (
              <div
                key={v.id}
                className="card-hover flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface/80 shadow-xl backdrop-blur-md"
              >
                {/* Photo banner — scrim keeps the favourite star legible on any photo */}
                <div className="relative">
                  <VoicePhotoBanner voice={v} className="aspect-[4/3] w-full" />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                  <button
                    type="button"
                    onClick={() => toggleFavourite(v.id)}
                    aria-label={
                      isFavourite(v.id) ? "Remove favourite" : "Add favourite"
                    }
                    title={
                      isFavourite(v.id) ? "Remove favourite" : "Add favourite"
                    }
                    className={`absolute right-2 top-2 rounded-full bg-black/40 px-2 py-1 text-lg leading-none backdrop-blur-sm transition-colors ${
                      isFavourite(v.id)
                        ? "text-yellow-400"
                        : "text-white/70 hover:text-white"
                    }`}
                  >
                    {isFavourite(v.id) ? "★" : "☆"}
                  </button>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {v.name}
                    {voiceTier(v.id) === "premium" && <HdBadge />}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {v.accent} · {v.gender}
                  </p>
                  <button
                    onClick={() => selectVoice(v.id)}
                    className="lift mt-4 rounded-xl border border-border py-2 text-xs font-medium text-foreground hover:border-accent/50 hover:bg-surface-2"
                  >
                    Use in Generate →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <p className="mt-4 text-center text-xs text-muted">
            {filtered.length} of {voices.length} voices
          </p>
        )}
      </div>
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
