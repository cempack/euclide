/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  // React Compiler: components and hooks memoized at build time, so a state
  // change re-renders only what reads it.
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],

  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
  },

  // Tauri expects a fixed port and fails if it is not available.
  clearScreen: false,

  build: {
    // Silence the "large chunk" warning for now; main bundle includes heavy deps like PDF.js, editors, etc.
    // For production, consider code-splitting with manualChunks or dynamic imports for NoteEditor etc.
    chunkSizeWarningLimit: 600,
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
