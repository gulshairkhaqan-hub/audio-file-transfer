"use client";

// Feature 2 — Voice Generation.
// Pick a preset voice + type text → backend calls Kokoro via the HF Space,
// stores the result on Cloudinary, and returns a shareable URL.
import { useEffect, useState } from "react";
import { api, MAX_TEXT_CHARS, DEFAULT_SPEED } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { useVoices } from "@/lib/useVoices";
import VoiceSelect from "@/components/VoiceSelect";
import SpeedControl from "@/components/SpeedControl";
import { PICK_VOICE_KEY } from "@/app/studio/voices/page";
import ResultPanel from "@/components/ResultPanel";
import RecentList from "@/components/RecentList";
import { Waveform } from "@/components/icons";

function Heading() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-accent">
        <Waveform size={20} />
      </span>
      <h1 className="text-2xl font-bold tracking-tight">Voice Generation</h1>
    </div>
  );
}

export default function GeneratePage() {
  const { success, error: toastError } = useToast();
  const { voices, loading: voicesLoading, error: voicesError } = useVoices();
  const [voice, setVoice] = useState("");
  const [text, setText] = useState("");
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // On first load, honour a voice chosen from the Voice Library (stashed in
  // localStorage by that page); otherwise default to the first voice.
  useEffect(() => {
    if (voices.length === 0 || voice) return;
    let picked = "";
    try {
      picked = localStorage.getItem(PICK_VOICE_KEY) || "";
      if (picked) localStorage.removeItem(PICK_VOICE_KEY);
    } catch {
      // ignore storage errors — just fall back to the first voice
    }
    const valid = picked && voices.some((v) => v.id === picked);
    setVoice(valid ? picked : voices[0].id);
  }, [voices, voice]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResultUrl("");

    if (!voice) {
      toastError("Please select a voice.");
      return;
    }
    if (!text.trim()) {
      toastError("Please type some text to speak.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.generateVoice({
        voice,
        text: text.trim(),
        speed,
      });
      setResultUrl(res.url);
      success("Voice generated successfully!");
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
            Couldn&apos;t load voices. The backend may be starting up — refresh in a
            minute.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl fade-up">
      <Heading />
      <p className="mt-2 text-sm text-muted">
        Pick a preset voice and type text — the AI generates audio spoken in that
        voice. No sample needed.
      </p>

      <form
        onSubmit={handleSubmit}
        className="relative z-20 mt-6 space-y-5 rounded-2xl border border-border bg-surface p-6 shadow-sm"
      >
        <div className="space-y-1.5">
          <label className="ml-1 text-xs font-medium uppercase tracking-widest text-muted">
            Voice
          </label>
          <VoiceSelect
            voices={voices}
            value={voice}
            onChange={setVoice}
            loading={voicesLoading}
          />
        </div>

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
            placeholder="Type what the voice should say…"
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
              Generating… (may take a minute)
            </>
          ) : (
            "Generate voice"
          )}
        </button>
      </form>

      {resultUrl && <ResultPanel url={resultUrl} />}

      <RecentList kind="generate" reloadKey={reloadKey} />
    </div>
  );
}
