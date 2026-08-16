"use client";

// ▶ / ⏸ button that plays a short pre-recorded sample of a preset voice, so a
// user can hear it before generating. Samples are static Cloudinary clips (see
// lib/voicePreviews.ts, produced once by backend/gen_previews.py) — there is no
// model call per click, so this costs nothing at runtime.
//
// One clip plays at a time: a single <audio> is shared across every button, and
// a custom window event tells the other buttons to reset their icon when a new
// clip starts. A voice with no sample yet renders nothing (button hidden).
import { useEffect, useRef, useState } from "react";
import { VOICE_PREVIEWS } from "@/lib/voicePreviews";

// One shared player for the whole app — starting a clip stops the previous one.
let sharedAudio: HTMLAudioElement | null = null;
const PLAY_EVENT = "voxclone:preview-play";

function getAudio(): HTMLAudioElement {
  if (!sharedAudio) sharedAudio = new Audio();
  return sharedAudio;
}

export function VoicePreviewButton({
  voiceId,
  size = 32,
  className = "",
}: {
  voiceId: string;
  size?: number;
  className?: string;
}) {
  const url = VOICE_PREVIEWS[voiceId];
  const [playing, setPlaying] = useState(false);
  // Keep the current url readable inside stable event handlers.
  const urlRef = useRef(url);
  urlRef.current = url;

  useEffect(() => {
    if (!url) return;
    const audio = getAudio();
    // Another button started a clip -> we're no longer the active one.
    function onOther(e: Event) {
      if ((e as CustomEvent<string>).detail !== urlRef.current) setPlaying(false);
    }
    // Our clip finished on its own.
    function onEnded() {
      if (audio.src === urlRef.current) setPlaying(false);
    }
    window.addEventListener(PLAY_EVENT, onOther);
    audio.addEventListener("ended", onEnded);
    return () => {
      window.removeEventListener(PLAY_EVENT, onOther);
      audio.removeEventListener("ended", onEnded);
    };
  }, [url]);

  if (!url) return null; // no sample for this voice yet

  function toggle(e: React.MouseEvent) {
    e.stopPropagation(); // don't trigger the surrounding card / select-row click
    const audio = getAudio();
    if (playing && audio.src === url) {
      audio.pause();
      setPlaying(false);
      return;
    }
    audio.src = url;
    window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: url }));
    audio
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false)); // autoplay blocked / load failed
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? "Pause preview" : "Play preview"}
      title={playing ? "Pause preview" : "Play preview"}
      className={`flex items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60 ${className}`}
      style={{ width: size, height: size }}
    >
      {playing ? (
        <svg width={size * 0.45} height={size * 0.45} viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      ) : (
        <svg width={size * 0.45} height={size * 0.45} viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      )}
    </button>
  );
}
