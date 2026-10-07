import { createReadStream, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import type { Plugin } from "vite";

/**
 * pdf.js loads its fonts, character maps, colour profiles and decoders
 * (wasm) by URL at run time. They are served from node_modules/pdfjs-dist
 * in development and copied to /pdfjs-assets/ in the build, so the
 * version always matches the library.
 */
const ROOT = resolve("node_modules/pdfjs-dist");
const DIRS = ["cmaps", "standard_fonts", "wasm", "iccs"];
const TYPES: Record<string, string> = {
  ".bcmap": "application/octet-stream",
  ".pfb": "application/octet-stream",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".icc": "application/vnd.iccprofile",
};

export function pdfjsAssets(): Plugin {
  return {
    name: "euclide-pdfjs-assets",
    configureServer(server) {
      server.middlewares.use("/pdfjs-assets", (req, res, next) => {
        const rel = normalize(decodeURIComponent((req.url ?? "").split("?")[0])).replace(/^([/\\])+/, "");
        const file = join(ROOT, rel);
        if (!file.startsWith(ROOT) || !DIRS.includes(rel.split(/[/\\]/)[0])) return next();
        try {
          if (!statSync(file).isFile()) return next();
        } catch {
          return next();
        }
        res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const dir of DIRS) {
        for (const name of readdirSync(join(ROOT, dir))) {
          if (name.endsWith(".md") || name === "LICENSE") continue;
          this.emitFile({
            type: "asset",
            fileName: `pdfjs-assets/${dir}/${name}`,
            source: readFileSync(join(ROOT, dir, name)),
          });
        }
      }
    },
  };
}
