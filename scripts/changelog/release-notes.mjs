// A release's notes, from CHANGELOG.md: every version after `--since` (the
// release published before it) up to this one, the newest first. An update
// that skips a version (0.5.0 came out inside 0.6.0) tells all of them.
//
//   node scripts/changelog/release-notes.mjs <version> [--since <version>] [--text]
//
// Markdown for the GitHub release page: each version's section, its
// pictures pointed at the release's tag (a release page has no repository
// around it), then the install note the workflow writes. With --text, what
// Euclide shows before installing (latest.json): the same news as plain
// text, without pictures or Markdown marks.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const text = args.includes("--text");
const sinceAt = args.indexOf("--since");
const since = sinceAt < 0 ? "" : (args[sinceAt + 1] ?? "");
const version = args.find((a, i) => !a.startsWith("--") && (sinceAt < 0 || i !== sinceAt + 1));
if (!version) {
  console.error("usage: release-notes.mjs <version> [--since <version>] [--text]");
  process.exit(1);
}

const compare = (a, b) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const log = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
const sections = log
  .split(/^## /m)
  .slice(1)
  .map((part) => {
    const end = part.indexOf("\n");
    return { version: part.slice(0, end).trim(), body: part.slice(end + 1).trim() };
  })
  .filter((s) => /^\d+\.\d+\.\d+$/.test(s.version));

if (!sections.some((s) => s.version === version)) {
  console.error(`No « ## ${version} » in CHANGELOG.md`);
  process.exit(1);
}
// No release before it, or one at least as new (a re-run): this version alone.
const told = sections.filter((s) =>
  since && compare(since, version) < 0
    ? compare(s.version, since) > 0 && compare(s.version, version) <= 0
    : s.version === version,
);

if (text) {
  const plain = (body) =>
    body
      .split("\n")
      .filter((line) => !/^\s*(!\[|<\/?p>|<img)/.test(line))
      .map((line) =>
        line
          .replace(/^#+ /, "")
          .replace(/\*\*/g, "")
          .replace(/`/g, "")
          .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"),
      )
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  const one = told.length === 1;
  process.stdout.write(
    `${told.map((s) => (one ? plain(s.body) : `Version ${s.version}\n\n${plain(s.body)}`)).join("\n\n\n")}\n`,
  );
  process.exit(0);
}

const raw = `https://raw.githubusercontent.com/cempack/euclide/v${version}/`;
const body = told
  .map((s) => `## Nouveautés de la ${s.version}\n\n${s.body}`.replace(/(\]\(|src=")(docs\/)/g, `$1${raw}$2`))
  .join("\n\n");

process.stdout.write(`${body}

---

Installateurs et archives USB portables.

L’application vérifie \`latest.json\` sur GitHub Releases. Windows portable met à jour \`Euclide-windows-portable.zip\` **dans le dossier courant** (Euclide-Data intact). Les copies NSIS utilisent l’installateur.
`);
