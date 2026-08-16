"use client";
import { useEffect, useState } from "react";
import { api, type Voice } from "@/lib/api";

export function useVoices() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.voices();
        if (!cancelled) setVoices(list);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Couldn't load voices."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { voices, loading, error };
}

export function voiceLabel(v: Voice) {
  return `${v.name} — ${v.accent}, ${v.gender}`;
}

export type VoiceTier = "premium" | "standard" | "basic";

const PREMIUM = new Set(["af_heart", "af_bella", "bf_emma", "af_nicole"]);
const STANDARD = new Set([
  "af_aoede", "af_kore", "af_sarah", "am_michael", "am_fenrir", "am_puck",
  "af_alloy", "af_nova", "bf_isabella", "bm_george", "bm_fable", "af_sky",
]);

export function voiceTier(id: string): VoiceTier {
  if (PREMIUM.has(id)) return "premium";
  if (STANDARD.has(id)) return "standard";
  return "basic";
}
