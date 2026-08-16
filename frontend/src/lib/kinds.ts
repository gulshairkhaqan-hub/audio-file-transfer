
export type Kind = "clone" | "generate" | "mix";

export const KINDS: Record<Kind, { label: string; icon: string; href: string }> = {
  clone: { label: "Voice Cloning", icon: "🎙️", href: "/studio/clone" },
  generate: { label: "Voice Generation", icon: "🔊", href: "/studio/generate" },
  mix: { label: "Voice Mixing", icon: "🎛️", href: "/studio/mix" },
};

export const KIND_ORDER: Kind[] = ["clone", "generate", "mix"];

export function kindMeta(kind?: string) {
  if (kind && kind in KINDS) return KINDS[kind as Kind];
  return { label: "Audio", icon: "🎵", href: "/studio" };
}
