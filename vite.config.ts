/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { pdfjsAssets } from "./scripts/vite-pdfjs-assets";

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  // React Compiler: components and hooks memoized at build time, so a state
  // change re-renders only what reads it.
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss(), pdfjsAssets()],

  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
  },

  // Tauri expects a fixed port and fails if it is not available.
  clearScreen: false,

  build: {
    // Every screen is its own chunk; the largest, the document viewer (PDF.js
    // with its polyfills), loads only when a document is opened.
    chunkSizeWarningLimit: 800,
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
