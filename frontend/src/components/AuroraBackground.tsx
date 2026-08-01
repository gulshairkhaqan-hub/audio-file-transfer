// AuroraBackground — calm, premium ambient glow for the auth hero.
// Replaces the loud WebGL voice-wave. Pure CSS (see `.aurora` in globals.css):
// two slowly-drifting blurred radial blobs in the brand purple→blue, on the
// dark background. Lightweight, no WebGL, respects prefers-reduced-motion.
export default function AuroraBackground({
  className = "",
}: {
  className?: string;
}) {
  return <div aria-hidden className={`aurora ${className}`} />;
}
