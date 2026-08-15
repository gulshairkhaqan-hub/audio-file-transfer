"use client";

// Feature 3 — Voice Mixing.
// Pick two preset voices + a blend weight → the backend asks the HF Space to
// average their Kokoro voice embeddings and speak the text in the result.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { useVoices } from "@/lib/useVoices";
import VoiceSelect from "@/components/VoiceSelect";
import ResultPanel from "@/components/ResultPanel";
import RecentList from "@/components/RecentList";

export default function MixPage() {
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const { voices, loading: voicesLoading, error: voicesError } = useVoices();
  const [voiceA, setVoiceA] = useState("");
  const [voiceB, setVoiceB] = useState("");
  const [blend, setBlend] = useState(0.5);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // Default to two *different* voices so the blend is audible out of the box.
  useEffect(() => {
    if (voices.length > 0 && !voiceA) setVoiceA(voices[0].id);
    if (voices.length > 1 && !voiceB) setVoiceB(voices[voices.length - 1].id);
  }, [voices, voiceA, voiceB]);

  const sameVoice = Boolean(voiceA && voiceA === voiceB);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResultUrl("");

    if (!voiceA || !voiceB) {
      toastError("Please select two voices.");
      return;
    }
    if (!text.trim()) {
      toastError("Please type some text to speak.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.mixVoices({
        voiceA,
        voiceB,
        blend,
        text: text.trim(),
        email: user?.email || "",
      });
      setResultUrl(res.url);
      success("Voices mixed successfully!");
      setReloadKey((k) => k + 1);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (voicesError) {
    return (
      <div className="mx-auto max-w-3xl fade-up">
        <h1 className="text-2xl font-semibold tracking-tight">🎛️ Voice Mixing</h1>
        <div className="card-hover mt-6 rounded-2xl border border-white/10 bg-surface/80 p-6 text-center shadow-2xl backdrop-blur-md">
          <p className="text-sm text-muted">
            Couldn&apos;t load voices. The backend may be starting up — refresh in
            a minute.
          </p>
        </div>
      </div>
    );
  }

  const nameOf = (id: string) =>
    voices.find((v) => v.id === id)?.name || "Voice";

  return (
    <div className="mx-auto max-w-3xl fade-up">
      <h1 className="text-2xl font-semibold tracking-tight">🎛️ Voice Mixing</h1>
      <p className="mt-1 text-sm text-muted">
        Blend two voices into a new one — the slider controls how much of each
        you hear.
      </p>

      <form
        onSubmit={handleSubmit}
        className="card-hover mt-6 space-y-5 rounded-2xl border border-white/10 bg-surface/80 p-6 shadow-2xl backdrop-blur-md"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="ml-1 text-xs uppercase tracking-widest text-muted">
              Voice A
            </label>
            <VoiceSelect
              voices={voices}
              value={voiceA}
              onChange={setVoiceA}
              loading={voicesLoading}
              otherId={voiceB}
            />
          </div>

          <div className="space-y-1.5">
            <label className="ml-1 text-xs uppercase tracking-widest text-muted">
              Voice B
            </label>
            <VoiceSelect
              voices={voices}
              value={voiceB}
              onChange={setVoiceB}
              loading={voicesLoading}
              otherId={voiceA}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <label className="text-xs uppercase tracking-widest text-muted">
              Blend
            </label>
            <span className="text-xs text-muted">
              {Math.round(blend * 100)}% {nameOf(voiceA)} ·{" "}
              {Math.round((1 - blend) * 100)}% {nameOf(voiceB)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={blend}
            onChange={(e) => setBlend(parseFloat(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
        </div>

        {sameVoice && (
          <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-300/90">
            Both slots use the same voice — pick two different ones to hear a
            blend.
          </p>
        )}

        <div className="space-y-1.5">
          <label className="ml-1 text-xs uppercase tracking-widest text-muted">
            Text to speak
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Type what the mixed voice should say…"
            className="field w-full rounded-xl border border-transparent bg-surface-2 px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted/50"
          />
        </div>

        <button
          type="submit"
          disabled={loading || voicesLoading || voices.length === 0}
          className="lift sheen gradient-accent flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-[0_0_20px_var(--accent-glow)] hover:shadow-[0_0_32px_var(--accent-glow)] active:scale-[0.98] disabled:opacity-60"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Mixing… (may take a minute)
            </>
          ) : (
            "Mix voices"
          )}
        </button>
      </form>

      {resultUrl && <ResultPanel url={resultUrl} label="Your mixed voice" />}

      <RecentList kind="mix" reloadKey={reloadKey} />
    </div>
  );
}
