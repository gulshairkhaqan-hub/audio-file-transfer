"use client";

// Shared result card for the clone / generate / mix features: plays the
// generated audio and offers download (MP3) + copy-link + open-in-tab.
import { useToast } from "@/components/Toast";
import AudioPlayer from "@/components/AudioPlayer";
import { downloadAudio, toAudioFilename } from "@/lib/download";
import { Download } from "@/components/icons";

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
    <div className="mt-6 space-y-3 rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <AudioPlayer src={url} />
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={download}
          className="lift gradient-accent inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white"
        >
          <Download size={15} /> Download MP3
        </button>
        <button
          onClick={copyLink}
          className="lift rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-2"
        >
          Copy link
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-1 text-sm font-medium text-accent-2 hover:underline"
        >
          Open in new tab
        </a>
      </div>
    </div>
  );
}
