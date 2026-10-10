import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ima: {
          primary: "#2563EB",
          "primary-hover": "#1D4ED8",
          secondary: "#1E40AF",
          accent: "#3B82F6",
          // Semantic hues are used as TEXT on their own /10 tint (the status-chip
          // pattern, often at 10px), so they must clear WCAG AA 4.5:1 against that
          // composited background — not just against white. The original brighter
          // values failed badly (success 2.31:1, warning 1.99:1, error 3.29:1,
          // info 3.29:1). Darkened 2026-07-21; contrast on own /10 tint noted below.
          // White-on-solid also passes for all four, so filled surfaces are safe.
          success: "#047857", // 4.78:1 on tint · 5.48:1 on white
          // Graphics-only green for status dots / progress fills, where the dark
          // text-grade emerald reads muddy. 3.30:1 on white clears the WCAG 3:1
          // non-text bar. NEVER use for text — use `success` for that.
          "success-bright": "#16A34A",
          // "Online now" green (WhatsApp/Messenger presence) — for small status
          // DOTS only, always on a white ring. Too light for icons or text.
          live: "#25D366",
          warning: "#92400E", // 6.08:1 on tint · 7.09:1 on white
          error: "#B91C1C", //   5.45:1 on tint · 6.47:1 on white
          info: "#1D4ED8", //    5.72:1 on tint · 6.70:1 on white
          bg: "#FFFFFF",
          surface: "#FFFFFF",
          "surface-light": "#F1F5F9",
          "surface-accent": "#EFF6FF",
          // Sidebar frame — a warm light beige so the nav reads as its own
          // plane against the white canvas (requested 2026-10-10). Sidebar only.
          sidebar: "#FAF7F2",
          "sidebar-hover": "#F2ECE2",
          "sidebar-border": "#ECE5D8",
          border: "#E2E8F0",
          text: "#1E293B", //           14.63:1 on white
          // Nudged from #64748B, which passed on white (4.76:1) but failed on
          // `surface-light` (4.34:1) — and that surface is used 294 times. This is
          // now the workhorse body/label color after the `text-muted` migration,
          // so it has to clear AA on BOTH canvases.
          "text-secondary": "#5F6E85", // 5.18:1 on white · 4.73:1 on surface-light
          // 2.56:1 on white — FAILS AA and cannot be darkened without becoming
          // `text-secondary`. Legal ONLY where WCAG exempts it: decorative icons
          // marked aria-hidden, and genuinely inactive controls (locked roadmap
          // steps, outside-month calendar days). 12 sanctioned usages remain.
          // Never use it for text that carries information.
          "text-muted": "#94A3B8",
          overlay: "rgba(0, 0, 0, 0.5)",
          // NOTE: the pastel-*/magenta/teal/violet tokens were removed here.
          // They belonged to a retired "vibrant student_diy lane"; student_diy now
          // shares the editorial-restrained lane 1:1 with student, and the tokens
          // had 0 usages in src/. Blue is the only signal color — see
          // docs/design/03-general-vibe.md. Do not reintroduce them.
        },
      },
      boxShadow: {
        // Soft resting lift so white cards separate from the white canvas
        // (editorial-restrained — barely there, cool slate-tinted).
        card: "0 1px 2px 0 rgba(15,23,42,0.04), 0 2px 8px -2px rgba(15,23,42,0.05)",
        "card-hover": "0 8px 25px -5px rgba(0,0,0,0.1)",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      transitionTimingFunction: {
        // Expressive easing — physical, not mechanical. Banishes default `ease-out`.
        "expo-out": "cubic-bezier(0.16, 1, 0.3, 1)",
        "quart-out": "cubic-bezier(0.25, 1, 0.5, 1)",
      },
      animation: {
        fadeIn: "fadeIn 300ms ease-out both",
        scaleIn: "scaleIn 300ms ease-out both",
        slideUp: "slideUp 400ms ease-out both",
        // Choreographed reveal — content rises into place on expo-out.
        riseIn: "slideUp 600ms cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
