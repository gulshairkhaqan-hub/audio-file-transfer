"use client";

// Feature 2 — Voice Generation.
// Pick a preset voice + type text → backend calls Kokoro via the HF Space,
// stores the result on Cloudinary, and returns a shareable URL.
import { useEffect, useState } from "react";
import { api, MAX_TEXT_CHARS } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { useVoices } from "@/lib/useVoices";
import VoiceSelect from "@/components/VoiceSelect";
import { PICK_VOICE_KEY } from "@/app/studio/voices/page";
import ResultPanel from "@/components/ResultPanel";
import RecentList from "@/components/RecentList";

export default function GeneratePage() {
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const { voices, loading: voicesLoading, error: voicesError } = useVoices();
  const [voice, setVoice] = useState("");
  const [text, setText] = useState("");
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
        email: user?.email || "",
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
        <h1 className="text-2xl font-semibold tracking-tight">🔊 Voice Generation</h1>
        <div className="card-hover mt-6 rounded-2xl border border-white/10 bg-surface/80 p-6 text-center shadow-2xl backdrop-blur-md">
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
      <h1 className="text-2xl font-semibold tracking-tight">🔊 Voice Generation</h1>
      <p className="mt-1 text-sm text-muted">
        Pick a preset voice and type text — the AI generates audio spoken in that
        voice. No sample needed.
      </p>

      <form
        onSubmit={handleSubmit}
        className="card-hover relative z-20 mt-6 space-y-5 rounded-2xl border border-white/10 bg-surface/80 p-6 shadow-2xl backdrop-blur-md"
      >
        <div className="space-y-1.5">
          <label className="ml-1 text-xs uppercase tracking-widest text-muted">
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
            <label className="ml-1 text-xs uppercase tracking-widest text-muted">
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
