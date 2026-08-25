"use client";

// Feature 1 — Voice Cloning.
// Upload a voice sample + type text → backend forwards to the HF Space (Pocket TTS),
// stores the result on Cloudinary, and returns a shareable URL.
import { useState } from "react";
import { api, MAX_TEXT_CHARS } from "@/lib/api";
import { useToast } from "@/components/Toast";
import ResultPanel from "@/components/ResultPanel";
import RecentList from "@/components/RecentList";
import { Mic, Upload, Headphones } from "@/components/icons";

// Kept in step with the backend's own limits (server.py is the real gate — these
// only spare the user a round-trip and spare us the model compute).
const MAX_SAMPLE_BYTES = 4 * 1024 * 1024;
const MAX_SAMPLE_SECONDS = 120;

/** Read a sample's duration in the browser. Resolves 0 if it can't be decoded. */
function sampleDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = new Audio();
    const done = (seconds: number) => {
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : 0);
    el.onerror = () => done(0);
    el.src = url;
  });
}

export default function ClonePage() {
  const { success, error: toastError } = useToast();
  const [audio, setAudio] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResultUrl("");

    if (!audio) {
      toastError("Please choose a voice sample audio file.");
      return;
    }
    if (!text.trim()) {
      toastError("Please type some text to speak.");
      return;
    }
    if (audio.size > MAX_SAMPLE_BYTES) {
      toastError(
        `That sample is too large — keep it under ${MAX_SAMPLE_BYTES / (1024 * 1024)} MB.`
      );
      return;
    }

    setLoading(true);
    try {
      const seconds = await sampleDuration(audio);
      if (seconds > MAX_SAMPLE_SECONDS) {
        toastError(
          `That sample is ${Math.round(seconds)}s long — trim it to under ${MAX_SAMPLE_SECONDS}s.`
        );
        return;
      }

      const res = await api.cloneVoice({ audio, text: text.trim() });
      setResultUrl(res.url);
      success("Voice cloned successfully!");
      setReloadKey((k) => k + 1);
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("audio/")) setAudio(f);
    else toastError("Please drop an audio file.");
  }

  return (
    <div className="mx-auto max-w-3xl fade-up">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-accent">
          <Mic size={20} />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">Voice Cloning</h1>
      </div>
      <p className="mt-2 text-sm text-muted">
        Upload a voice sample and type text — the AI speaks your text in that
        voice&apos;s tone. A clean ~20s clip works best.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-5 rounded-2xl border border-border bg-surface p-6 shadow-sm"
      >
        <div className="space-y-1.5">
          <label className="ml-1 text-xs font-medium uppercase tracking-widest text-muted">
            Voice sample
          </label>
          {/* Drag-and-drop dropzone */}
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-9 text-center transition-colors ${
              dragOver
                ? "border-accent bg-accent/5"
                : "border-border bg-surface-2 hover:border-accent/50"
            }`}
          >
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setAudio(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <span className="text-muted">
              {audio ? <Headphones size={26} /> : <Upload size={26} />}
            </span>
            <span className="text-sm font-medium text-foreground">
              {audio ? audio.name : "Drop an audio file or click to browse"}
            </span>
            <span className="text-xs text-muted">MP3, WAV, M4A · ~20s ideal</span>
          </label>
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
            placeholder="Type what the cloned voice should say…"
            className="field w-full resize-y rounded-xl border border-transparent bg-surface-2 px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted/60"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="lift gradient-accent flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-60"
        >
          {loading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Cloning… (may take a minute)
            </>
          ) : (
            "Clone voice"
          )}
        </button>
      </form>

      {resultUrl && <ResultPanel url={resultUrl} label="Your cloned audio" />}

      <RecentList kind="clone" reloadKey={reloadKey} />
    </div>
  );
}
