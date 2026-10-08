// Windows and macOS ignore case in file names. Two modules whose names only
// differ in case (templates.ts beside Templates.tsx) build on Linux, then
// break the Windows and macOS builds: TypeScript and Vite take one for the
// other. Fails when the repository holds such a pair, or two paths that
// only differ in case.
//
//   node scripts/check-names.mjs        (part of npm run lint)
import { execFileSync } from "node:child_process";

const MODULE = /\.(?:tsx?|jsx?|mjs|cjs)$/;
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);

const seen = new Map();
const clashes = [];
for (const file of files) {
  // A module is imported without its extension: its stem must be unique too.
  const keys = [file.toLowerCase()];
  if (MODULE.test(file)) keys.push(`module:${file.replace(MODULE, "").toLowerCase()}`);
  for (const key of keys) {
    const other = seen.get(key);
    if (other && other !== file) clashes.push(`${other} ↔ ${file}`);
    else seen.set(key, file);
  }
}

if (clashes.length) {
  console.error("check-names: names that only differ in case (Windows and macOS see one file):");
  for (const c of clashes) console.error(`  ${c}`);
  process.exit(1);
}
console.log("check-names: ok");
