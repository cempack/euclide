/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // libadwaita / macOS inspired calm palette
        eu: {
          bg: "rgb(var(--eu-bg) / <alpha-value>)",
          surface: "rgb(var(--eu-surface) / <alpha-value>)",
          card: "rgb(var(--eu-card) / <alpha-value>)",
          border: "rgb(var(--eu-border) / <alpha-value>)",
          text: "rgb(var(--eu-text) / <alpha-value>)",
          muted: "rgb(var(--eu-muted) / <alpha-value>)",
          accent: "rgb(var(--eu-accent) / <alpha-value>)",
          "accent-soft": "rgb(var(--eu-accent-soft) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "Segoe UI",
          "Cantarell",
          "system-ui",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl: "14px",
        "2xl": "20px",
        "3xl": "26px",
      },
      boxShadow: {
        soft: "0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.18)",
        card: "0 1px 0 rgb(255 255 255 / 0.04) inset, 0 1px 3px rgb(0 0 0 / 0.06), 0 10px 30px -18px rgb(0 0 0 / 0.25)",
        glow: "0 0 0 1px rgb(var(--eu-accent) / 0.18), 0 12px 40px -16px rgb(var(--eu-accent) / 0.45)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
        shimmer: "shimmer 2.2s linear infinite",
      },
    },
  },
  plugins: [],
};
