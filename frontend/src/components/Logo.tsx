// Inline VoxClone logo — waveform bars + wordmark.
// Inline (not <img>) so it scales cleanly via the className height.
// Pass `animated` to make the bars pulse; off by default (static looks cleaner).
export default function Logo({
  className = "h-14 w-auto",
  animated = false,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 520 140"
      className={className}
      role="img"
      aria-label="VoxClone"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="vc-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
        <filter id="vc-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g filter="url(#vc-glow)" fill="url(#vc-grad)">
        {[
          { x: 10, y: 52, h: 36, d: "0s" },
          { x: 34, y: 36, h: 68, d: "0.18s" },
          { x: 58, y: 18, h: 104, d: "0.36s" },
          { x: 82, y: 36, h: 68, d: "0.18s" },
          { x: 106, y: 52, h: 36, d: "0s" },
        ].map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={b.y}
            width={12}
            height={b.h}
            rx={6}
            style={
              animated
                ? {
                    transformBox: "fill-box",
                    transformOrigin: "center",
                    animation: `vc-pulse 1.6s ease-in-out ${b.d} infinite`,
                  }
                : undefined
            }
          />
        ))}
      </g>

      <text
        x={140}
        y={90}
        fontFamily="Geist, Inter, system-ui, -apple-system, sans-serif"
        fontSize={62}
        fontWeight={700}
        letterSpacing={-1}
        fill="url(#vc-grad)"
      >
        VoxClone
      </text>
    </svg>
  );
}
