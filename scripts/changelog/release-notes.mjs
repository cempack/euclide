// The GitHub release body for a version, from CHANGELOG.md: its section,
// with the images' paths made absolute (a release page has no repository
// around it), then the install note the workflow writes.
//
//   node scripts/changelog/release-notes.mjs 0.4.0 | gh release edit v0.4.0 --notes-file -
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];
if (!version) {
  console.error("usage: release-notes.mjs <version>");
  process.exit(1);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const log = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
const start = log.indexOf(`\n## ${version}\n`);
if (start < 0) {
  console.error(`No « ## ${version} » in CHANGELOG.md`);
  process.exit(1);
}
const next = log.indexOf("\n## ", start + 1);
const section = log.slice(start + 1, next < 0 ? undefined : next).trim();
const raw = "https://raw.githubusercontent.com/cempack/euclide/main/";
const body = section
  .replace(/^## .*$/m, `## Nouveautés de la ${version}`)
  .replace(/(\]\(|src=")(docs\/)/g, `$1${raw}$2`);

process.stdout.write(`${body}

---

Installateurs et archives USB portables.

L’application vérifie \`latest.json\` sur GitHub Releases. Windows portable met à jour \`Euclide-windows-portable.zip\` **dans le dossier courant** (Euclide-Data intact). Les copies NSIS utilisent l’installateur.
`);
