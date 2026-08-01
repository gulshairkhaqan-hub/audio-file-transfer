"use client";

// Shared result card for the clone / generate / mix features: plays the
// generated audio and offers a copy-link + open-in-tab pair.
import { useToast } from "@/components/Toast";
import AudioPlayer from "@/components/AudioPlayer";

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

  return (
    <div className="card-hover mt-6 space-y-3 rounded-2xl border border-white/10 bg-surface/80 p-6 shadow-2xl backdrop-blur-md">
      <p className="text-sm font-medium">{label}</p>
      <AudioPlayer src={url} />
      <div className="flex items-center gap-3">
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
