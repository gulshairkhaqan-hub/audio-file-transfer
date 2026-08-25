"use client";

// Feature 3 — Voice Mixing.
// Pick two preset voices + a blend weight → the backend asks the HF Space to
// average their Kokoro voice embeddings and speak the text in the result.
import { useEffect, useState } from "react";
import { api, MAX_TEXT_CHARS, DEFAULT_SPEED } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { useVoices } from "@/lib/useVoices";
import VoiceSelect from "@/components/VoiceSelect";
import SpeedControl from "@/components/SpeedControl";
import ResultPanel from "@/components/ResultPanel";
import RecentList from "@/components/RecentList";
import { Sliders, AlertTriangle } from "@/components/icons";

function Heading() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-accent">
        <Sliders size={20} />
      </span>
      <h1 className="text-2xl font-bold tracking-tight">Voice Mixing</h1>
    </div>
  );
}

export default function MixPage() {
  const { success, error: toastError } = useToast();
  const { voices, loading: voicesLoading, error: voicesError } = useVoices();
  const [voiceA, setVoiceA] = useState("");
  const [voiceB, setVoiceB] = useState("");
  const [blend, setBlend] = useState(0.5);
  const [text, setText] = useState("");
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
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
        speed,
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
        <Heading />
        <div className="mt-6 rounded-2xl border border-border bg-surface p-6 text-center shadow-sm">
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
      <Heading />
      <p className="mt-2 text-sm text-muted">
        Blend two voices into a new one — the slider controls how much of each
        you hear.
      </p>

      <form
        onSubmit={handleSubmit}
        className="relative z-20 mt-6 space-y-5 rounded-2xl border border-border bg-surface p-6 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="ml-1 text-xs font-medium uppercase tracking-widest text-muted">
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
            <label className="ml-1 text-xs font-medium uppercase tracking-widest text-muted">
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
            <label className="text-xs font-medium uppercase tracking-widest text-muted">
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
          <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-700">
            <AlertTriangle size={15} className="shrink-0" />
            Both slots use the same voice — pick two different ones to hear a
            blend.
          </p>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="ml-1 text-xs font-medium uppercase tracking-widest text-muted">
              Text to speak
            </label>
            <span
              className={`text-xs tabular-nums ${
                text.length >= MAX_TEXT_CHARS ? "text-accent-2" : "text-muted/70"
              }`}
            >
              {text.length}/{MAX_TEXT_CHARS}
            </span>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={MAX_TEXT_CHARS}
            placeholder="Type what the mixed voice should say…"
            className="field w-full resize-y rounded-xl border border-transparent bg-surface-2 px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted/60"
          />
        </div>

        <SpeedControl value={speed} onChange={setSpeed} disabled={loading} />

        <button
          type="submit"
          disabled={loading || voicesLoading || voices.length === 0}
          className="lift gradient-accent flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-60"
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
