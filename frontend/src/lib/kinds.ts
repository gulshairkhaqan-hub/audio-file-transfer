// Shared metadata for the three creation "kinds" (clone / generate / mix).
// Used by the Dashboard and Library so the label, icon, and route for each
// feature live in exactly one place. History records carry `kind` as a plain
// string, so kindMeta() tolerates unknown/missing values.
export type Kind = "clone" | "generate" | "mix";

export const KINDS: Record<Kind, { label: string; icon: string; href: string }> = {
  clone: { label: "Voice Cloning", icon: "🎙️", href: "/studio/clone" },
  generate: { label: "Voice Generation", icon: "🔊", href: "/studio/generate" },
  mix: { label: "Voice Mixing", icon: "🎛️", href: "/studio/mix" },
};

export const KIND_ORDER: Kind[] = ["clone", "generate", "mix"];

/** Resolve any history `kind` string to display metadata, with a safe
 *  fallback for records created before `kind` was tracked. */
export function kindMeta(kind?: string) {
  if (kind && kind in KINDS) return KINDS[kind as Kind];
  return { label: "Audio", icon: "🎵", href: "/studio" };
}
