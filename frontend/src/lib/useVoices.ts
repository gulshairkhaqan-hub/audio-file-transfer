"use client";

// Loads the preset voice list from the backend once per mount. Shared by the
// generate and mix features. Falls back to an empty list on failure — the
// pages surface that as a disabled form rather than a crash.
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

/** "Sophia — American, female" for a dropdown option label. */
export function voiceLabel(v: Voice) {
  return `${v.name} — ${v.accent}, ${v.gender}`;
}
