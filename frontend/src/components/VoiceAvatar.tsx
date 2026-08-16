"use client";

// Presentational bits shared by the VoiceSelect combobox and the Voice Library
// page: a gender-matched portrait (VoiceAvatar = circle, VoicePhotoBanner = card
// header) and the "HD" badge. Photos are hotlinked from randomuser.me — a free,
// fixed pool of portraits, so there are no assets to host. On any load error we
// fall back to a gender-tinted gradient with the voice's initial, so the UI
// never breaks if that CDN is unreachable.
// ponytail: fixed 100-face pool, so a few voices may reuse a face; swap for
// curated self-hosted photos if that ever matters.
import { useState } from "react";
import { type Voice } from "@/lib/api";

const GRADIENT: Record<string, string> = {
  female: "linear-gradient(135deg, #d946ef, #7c3aed)",
  male: "linear-gradient(135deg, #0ea5e9, #2563eb)",
};

function gradientFor(voice: Voice): string {
  return GRADIENT[voice.gender] ?? GRADIENT.female;
}

function initial(voice: Voice): string {
  return voice.name.charAt(0).toUpperCase();
}

// Deterministic gender-matched portrait: hash the voice id into randomuser.me's
// 0-99 range so a given voice always shows the same face.
function portraitUrl(voice: Voice): string {
  const bucket = voice.gender === "male" ? "men" : "women";
  let hash = 0;
  for (let i = 0; i < voice.id.length; i++) {
    hash = (hash * 31 + voice.id.charCodeAt(i)) >>> 0;
  }
  return `https://randomuser.me/api/portraits/${bucket}/${hash % 100}.jpg`;
}

export function VoiceAvatar({ voice, size = 34 }: { voice: Voice; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box =
    "flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white";

  if (failed) {
    return (
      <span
        className={box}
        style={{
          width: size,
          height: size,
          fontSize: size * 0.4,
          backgroundImage: gradientFor(voice),
        }}
      >
        {initial(voice)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external per-voice photo with a runtime fallback; next/image adds no value here
    <img
      src={portraitUrl(voice)}
      alt={voice.name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`${box} object-cover`}
      style={{ width: size, height: size }}
    />
  );
}

// Big photo banner for the Voice Library cards — same portrait + fallback as the
// avatar, sized by the caller (e.g. `h-40 w-full`) to fill a card header.
export function VoicePhotoBanner({
  voice,
  className = "",
}: {
  voice: Voice;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{ backgroundImage: gradientFor(voice) }}
      >
        <span className="text-4xl font-semibold text-white">{initial(voice)}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external per-voice photo with a runtime fallback; next/image adds no value here
    <img
      src={portraitUrl(voice)}
      alt={voice.name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}

export function HdBadge() {
  return (
    <span className="ml-2 rounded-full bg-accent/15 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-accent-2">
      HD
    </span>
  );
}
