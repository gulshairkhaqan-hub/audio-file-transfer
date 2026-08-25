"use client";

// Custom audio player — play/pause + a clickable waveform-style progress bar.
// Uses a hidden <audio> element for actual playback; the bars are decorative
// but fill up to reflect progress and let the user seek by clicking.
import { useEffect, useRef, useState } from "react";

// A fixed pseudo-waveform pattern (heights 0..1) — looks like a real clip
// without needing to decode audio. Consistent so it doesn't jump around.
const BARS = [
  0.3, 0.55, 0.8, 0.45, 0.65, 0.9, 0.5, 0.35, 0.7, 0.85, 0.4, 0.6, 0.95, 0.5,
  0.3, 0.55, 0.75, 0.45, 0.85, 0.6, 0.35, 0.7, 0.5, 0.8, 0.4, 0.6, 0.9, 0.45,
  0.3, 0.65,
];

function fmt(s: number) {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => {
      setCurrent(a.currentTime);
      setProgress(a.duration ? a.currentTime / a.duration : 0);
    };
    const onMeta = () => setDuration(a.duration);
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
      setCurrent(0);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play();
      setPlaying(true);
    }
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    a.currentTime = ratio * a.duration;
  }

  return (
    <div className="flex items-center gap-4 rounded-xl bg-surface-2 px-4 py-3">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play / pause */}
      <button
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
        className="lift flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white"
      >
        {playing ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Waveform seek bar */}
      <div
        onClick={seek}
        className="flex h-10 flex-1 cursor-pointer items-center gap-[3px]"
      >
        {BARS.map((h, i) => {
          const filled = i / BARS.length <= progress;
          return (
            <span
              key={i}
              className={`w-full rounded-full transition-colors ${
                filled ? "bg-accent" : "bg-border"
              }`}
              style={{ height: `${Math.max(15, h * 100)}%` }}
            />
          );
        })}
      </div>

      {/* Time */}
      <span className="w-20 shrink-0 text-right font-mono text-xs text-muted">
        {fmt(current)} / {fmt(duration)}
      </span>
    </div>
  );
}
