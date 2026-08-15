"use client";

// Small presentational bits shared by the VoiceSelect combobox and the Voice
// Library page: a gender-tinted circular avatar with the voice's initial, and
// the "HD" badge. Inline gradients (not Tailwind utilities) keep the avatar
// independent of the v3/v4 gradient-class rename.
import { type Voice } from "@/lib/api";

const AVATAR: Record<string, string> = {
  female: "linear-gradient(135deg, #d946ef, #7c3aed)",
  male: "linear-gradient(135deg, #0ea5e9, #2563eb)",
};

export function VoiceAvatar({
  voice,
  size = 34,
}: {
  voice: Voice;
  size?: number;
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        backgroundImage: AVATAR[voice.gender] ?? AVATAR.female,
      }}
    >
      {voice.name.charAt(0).toUpperCase()}
    </span>
  );
}

export function HdBadge() {
  return (
    <span className="ml-2 rounded-full bg-accent/15 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-accent-2">
      HD
    </span>
  );
}
