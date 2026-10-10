"use client";

/**
 * A one-shot confetti burst from the center of its (relative) parent. Pieces
 * are laid out on a deterministic radial spread — no Math.random — so there is
 * never a hydration mismatch and the burst reads the same every play. Purely
 * decorative: aria-hidden, pointer-events-none, and skipped entirely for users
 * who prefer reduced motion (the CSS animation only runs under prefers-reduced-
 * motion: no-preference, see globals.css).
 *
 * The `replayKey` prop lets a parent re-trigger the burst by changing its value
 * (a changed key remounts the burst and restarts the CSS animation).
 */
const COLORS = [
  "#FFFFFF", // white — reads on the gold surface
  "#FDE68A", // light gold highlight
  "#2563EB", // ima-primary — the one signal color
  "#1E40AF", // ima-secondary
  "#B45309", // deep amber
];

const PIECES = 30;

export function Confetti({ replayKey }: { replayKey?: string | number }) {
  return (
    <div
      key={replayKey}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="absolute left-1/2 top-[38%]">
        {Array.from({ length: PIECES }).map((_, i) => {
          // Even radial spread with two interleaved rings for depth.
          const angle = (i / PIECES) * Math.PI * 2 + (i % 2) * 0.32;
          const radius = i % 2 === 0 ? 150 : 96;
          const cx = Math.cos(angle) * radius;
          const cy = Math.sin(angle) * radius * 0.62 - 28; // bias upward
          const color = COLORS[i % COLORS.length];
          const isStrip = i % 3 === 0;
          const size = isStrip ? 5 : 7;
          return (
            <span
              key={i}
              className="confetti-piece absolute block"
              style={{
                width: size,
                height: isStrip ? size * 2.2 : size,
                backgroundColor: color,
                borderRadius: isStrip ? 1 : 2,
                // CSS custom props consumed by the confetti-burst keyframes.
                ["--cx" as string]: `${cx}px`,
                ["--cy" as string]: `${cy}px`,
                ["--cr" as string]: `${(i % 2 === 0 ? 1 : -1) * (220 + i * 14)}deg`,
                ["--spin" as string]: `${(i % 2 === 0 ? 1 : -1) * (140 + i * 8)}deg`,
                animationDelay: `${(i % 6) * 40}ms`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
