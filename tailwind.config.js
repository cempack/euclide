/** @type {import('tailwindcss').Config} */

/**
 * Euclide design system — direction « Atelier ».
 *
 * Rule: this file never *defines* a colour value. Every colour is a reference
 * to a CSS custom property declared in src/styles.css, so that
 *   - light and dark themes are a ten-line variable swap,
 *   - alpha variants (`bg-panel/60`, `border-line/25`) actually work,
 *   - there is exactly one place to look when a colour is wrong.
 *
 * Typography lives in the `.eu-t-*` component classes (src/styles.css): seven
 * roles, no ad-hoc pixel sizes.
 */
const ref = (name) => `rgb(var(--eu-${name}) / <alpha-value>)`;

export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surfaces
        canvas: ref("canvas"),
        panel: ref("panel"),
        "panel-alt": ref("panel-alt"),
        // Ink
        ink: ref("ink"),
        "ink-muted": ref("ink-muted"),
        "ink-faint": ref("ink-faint"),
        // Structure
        line: `rgb(var(--eu-line) / var(--eu-line-a))`,
        "line-strong": `rgb(var(--eu-line) / var(--eu-line-a-strong))`,
        // State (text-safe: all ≥ 6:1 on the canvas)
        accent: ref("accent"),
        "accent-soft": ref("accent-soft"),
        ok: ref("ok"),
        "ok-soft": ref("ok-soft"),
        warn: ref("warn"),
        "warn-soft": ref("warn-soft"),
        danger: ref("danger"),
        "danger-soft": ref("danger-soft"),
        // State (vivid: fills, dots and gauges only — never small text)
        "ok-solid": ref("ok-solid"),
        "warn-solid": ref("warn-solid"),
        "danger-solid": ref("danger-solid"),
        // Always-dark chrome (PDF stage, Python terminal)
        stage: ref("stage"),
        "stage-alt": ref("stage-alt"),
        "stage-ink": ref("stage-ink"),
      },
      fontFamily: {
        // Mono carries data, labels, keys and code; sans carries prose.
        sans: ["IBM Plex Sans", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: {
        // Two values. Containers 6 px, interactive 4 px.
        none: "0px",
        sm: "3px",
        DEFAULT: "4px",
        md: "6px",
        lg: "8px",
        full: "9999px",
      },
      transitionDuration: {
        fast: "120ms",
        DEFAULT: "180ms",
        base: "180ms",
        slow: "260ms",
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.2, 0, 0.2, 1)",
        out: "cubic-bezier(0.2, 0, 0.2, 1)",
        "in-out": "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      boxShadow: {
        // Nearly flat: one hairline lift for popovers and overlays only.
        none: "none",
        pop: "0 1px 2px rgb(0 0 0 / 0.05), 0 8px 24px -12px rgb(0 0 0 / 0.22)",
      },
      maxWidth: {
        col: "1080px",
      },
      zIndex: {
        overlay: "60",
        palette: "70",
        confirm: "90",
      },
    },
  },
  plugins: [],
};
