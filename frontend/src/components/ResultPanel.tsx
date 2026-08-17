"use client";

// Shared result card for the clone / generate / mix features: plays the
// generated audio and offers download (MP3) + copy-link + open-in-tab.
import { useToast } from "@/components/Toast";
import AudioPlayer from "@/components/AudioPlayer";
import { downloadAudio, toAudioFilename } from "@/lib/download";

export default function ResultPanel({
  url,
  label = "Your generated audio",
}: {
  url: string;
  label?: string;
}) {
  const { success, error: toastError } = useToast();

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      success("Link copied to clipboard!");
    } catch {
      toastError("Couldn't copy — please copy manually.");
    }
  }

  function download() {
    const name = url.split("/").pop()?.split("?")[0] || "voxclone-audio";
    downloadAudio(url, toAudioFilename(name));
  }

  return (
    <div className="card-hover mt-6 space-y-3 rounded-2xl border border-white/10 bg-surface/80 p-6 shadow-2xl backdrop-blur-md">
      <p className="text-sm font-medium">{label}</p>
      <AudioPlayer src={url} />
      <div className="flex items-center gap-3">
        <button
          onClick={download}
          className="lift sheen gradient-accent rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-[0_0_16px_var(--accent-glow)] hover:shadow-[0_0_26px_var(--accent-glow)]"
        >
          ⬇ Download MP3
        </button>
        <button
          onClick={copyLink}
          className="lift rounded-xl border border-border px-4 py-2 text-sm font-medium hover:border-accent/50 hover:bg-surface-2"
        >
          Copy link
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-accent-2 underline-offset-4 hover:underline"
        >
          Open in new tab
        </a>
      </div>
    </div>
  );
}
