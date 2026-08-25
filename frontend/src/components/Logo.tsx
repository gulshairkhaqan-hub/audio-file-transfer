// Inline VoxClone logo — waveform bars + wordmark.
// Inline (not <img>) so it scales cleanly via the className height.
// Light theme: indigo→violet bars (the brand signature), ink wordmark, no glow.
// Pass `animated` to make the bars pulse; `mark` for the bars-only badge (used
// in the compact pill nav).
const BARS = [
  { x: 10, y: 52, h: 36, d: "0s" },
  { x: 34, y: 36, h: 68, d: "0.18s" },
  { x: 58, y: 18, h: 104, d: "0.36s" },
  { x: 82, y: 36, h: 68, d: "0.18s" },
  { x: 106, y: 52, h: 36, d: "0s" },
];

export default function Logo({
  className = "h-9 w-auto",
  animated = false,
  mark = false,
}: {
  className?: string;
  animated?: boolean;
  mark?: boolean;
}) {
  const bars = (
    <g fill="url(#vc-grad)">
      {BARS.map((b, i) => (
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
  );

  const gradient = (
    <defs>
      <linearGradient id="vc-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#4f46e5" />
        <stop offset="100%" stopColor="#7c3aed" />
      </linearGradient>
    </defs>
  );

  if (mark) {
    return (
      <svg
        viewBox="0 0 128 140"
        className={className}
        role="img"
        aria-label="VoxClone"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {gradient}
        {bars}
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 520 140"
      className={className}
      role="img"
      aria-label="VoxClone"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {gradient}
      {bars}
      <text
        x={140}
        y={90}
        fontFamily="var(--font-jakarta), Inter, system-ui, sans-serif"
        fontSize={62}
        fontWeight={700}
        letterSpacing={-1.5}
        fill="#0b0b0f"
      >
        VoxClone
      </text>
    </svg>
  );
}

