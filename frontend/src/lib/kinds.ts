import type { ComponentType } from "react";
import { Mic, Waveform, Sliders } from "@/components/icons";

export type Kind = "clone" | "generate" | "mix";

type IconProps = { size?: number; className?: string };

export const KINDS: Record<
  Kind,
  { label: string; Icon: ComponentType<IconProps>; href: string }
> = {
  clone: { label: "Voice Cloning", Icon: Mic, href: "/studio/clone" },
  generate: { label: "Voice Generation", Icon: Waveform, href: "/studio/generate" },
  mix: { label: "Voice Mixing", Icon: Sliders, href: "/studio/mix" },
};

export const KIND_ORDER: Kind[] = ["clone", "generate", "mix"];

export function kindMeta(kind?: string) {
  if (kind && kind in KINDS) return KINDS[kind as Kind];
  return { label: "Audio", Icon: Waveform, href: "/studio" };
}
