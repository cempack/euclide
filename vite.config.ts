/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

/**
 * `virtual:changelog`: CHANGELOG.md and the pictures it shows, for the
 * « Nouveautés » screen. Only the pictures the text names go into the app,
 * not every file of docs/changelog.
 */
function changelog(): Plugin {
  const id = "virtual:changelog";
  const file = resolve(import.meta.dirname, "CHANGELOG.md");
  return {
    name: "euclide-changelog",
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load(loaded) {
      if (loaded !== `\0${id}`) return;
      this.addWatchFile(file);
      const log = readFileSync(file, "utf8");
      const paths = [...new Set([...log.matchAll(/\]\((docs\/changelog\/[^)\s]+)\)/g)].map((m) => m[1]))];
      return [
        ...paths.map((path, i) => `import picture${i} from ${JSON.stringify(`/${path}`)};`),
        `export const log = ${JSON.stringify(log)};`,
        `export const pictures = {${paths.map((path, i) => `${JSON.stringify(path)}: picture${i}`).join(", ")}};`,
      ].join("\n");
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  // React Compiler: components and hooks memoized at build time, so a state
  // change re-renders only what reads it.
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss(), changelog()],

  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
  },

  // Tauri expects a fixed port and fails if it is not available.
  clearScreen: false,

  build: {
    // Every screen is its own chunk; the largest, the document viewer (EmbedPDF
    // and PDFium's engine), loads only when a document is opened.
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
