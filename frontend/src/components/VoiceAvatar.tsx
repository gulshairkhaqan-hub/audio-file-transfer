"use client";

// Presentational bits shared by the VoiceSelect combobox and the Voice Library
// page: a gender-matched portrait (VoiceAvatar = circle, VoicePhotoBanner = card
// header) and the "HD" badge. Photos are hotlinked from Unsplash (see the
// curated pools below) — no assets to host. On any load error we fall back to a
// gender-tinted gradient with the voice's initial, so the UI never breaks if the
// image can't load.
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

// Curated HD professional portraits from Unsplash, split by gender. Each voice
// hashes to a stable index in its gender's pool, so a voice always shows the
// same face. `fit=facearea` face-crops the photo (heads don't get cut off) and
// we pull it at 512px — that's why these read as sharp studio portraits where
// the old 128px thumbnails looked soft and badly cropped.
// ponytail: hand-picked pools (~a dozen each), so voices past the pool size
// reuse a face; paste more Unsplash photo ids below if repeats bother you.
const WOMEN_PHOTOS = [
  "1573496359142-b8d87734a5a2",
  "1573497019940-1c28c88b4f3e",
  "1573497019236-17f8177b81e8",
  "1494790108377-be9c29b29330",
  "1581065178047-8ee15951ede6",
  "1701096374092-bb70915fdc5c",
  "1607990283143-e81e7a2c9349",
  "1701096351544-7de3c7fa0272",
  "1582896911227-c966f6e7fb93",
  "1607746882042-944635dfe10e",
  "1614786269829-d24616faf56d",
  "1609436132311-e4b0c9370469",
  "1630939687530-241d630735df",
  "1762341104634-998bbee0ccba",
  "1762341124796-530c0085f7d8",
];

const MEN_PHOTOS = [
  "1560250097-0b93528c311a",
  "1500648767791-00dcc994a43e",
  "1519085360753-af0119f7cbe7",
  "1543132220-3ec99c6094dc",
  "1676989880361-091e12efc056",
  "1652471943570-f3590a4e52ed",
  "1718209881007-c0ecdfc00f9d",
  "1624797432677-6f803a98acb3",
  "1590873803005-539ede4d828a",
  "1556474835-b0f3ac40d4d1",
  "1614023342667-6f060e9d1e04",
  "1642257859842-c95f9fa8121d",
  "1718209881006-f6e313e2e109",
];

const PHOTO_PARAMS = "auto=format&fit=facearea&facepad=3&w=512&h=512&q=75";

function portraitUrl(voice: Voice): string {
  const pool = voice.gender === "male" ? MEN_PHOTOS : WOMEN_PHOTOS;
  let hash = 0;
  for (let i = 0; i < voice.id.length; i++) {
    hash = (hash * 31 + voice.id.charCodeAt(i)) >>> 0;
  }
  return `https://images.unsplash.com/photo-${pool[hash % pool.length]}?${PHOTO_PARAMS}`;
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
