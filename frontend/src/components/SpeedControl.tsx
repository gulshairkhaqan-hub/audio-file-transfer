"use client";

// Speed slider shared by Voice Generation and Voice Mixing. Scales the talking
// rate from 0.5× (slower) to 2× (faster); 1× is normal. Bounds come from api.ts
// so they stay in lock-step with the backend and model service.
import { MIN_SPEED, MAX_SPEED, DEFAULT_SPEED, SPEED_STEP } from "@/lib/api";

export default function SpeedControl({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="ml-1 text-xs uppercase tracking-widest text-muted">
          Speed
        </label>
        <div className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-foreground">
            {value.toFixed(2)}×
          </span>
          {value !== DEFAULT_SPEED && (
            <button
              type="button"
              onClick={() => onChange(DEFAULT_SPEED)}
              disabled={disabled}
              className="text-[11px] text-accent-2 hover:underline disabled:opacity-50"
            >
              Reset
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={MIN_SPEED}
        max={MAX_SPEED}
        step={SPEED_STEP}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--accent)] disabled:opacity-50"
      />
      <div className="flex justify-between px-0.5 text-[10px] text-muted/60">
        <span>0.5× slower</span>
        <span>1× normal</span>
        <span>2× faster</span>
      </div>
    </div>
  );
}
