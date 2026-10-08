// Real runner output for the changelog's Python screenshots: each script goes
// through the sidecar's runner (python -m euclide_sidecar --run), as Euclide
// would run it, and its events are kept to be replayed by the sample data.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const python = process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3");
const template = (f) => readFileSync(resolve(root, "src/features/python/templates", f), "utf8");

export const SCRIPTS = [
  { name: "Rosace", code: template("rosace.py"), checks: false },
  { name: "Courbe d'une fonction", code: template("courbe.py"), checks: false },
  { name: "Moyenne et mention", code: readFileSync(resolve(here, "notes-demo.py"), "utf8"), checks: true },
];

function run({ name, code, checks }) {
  return new Promise((ok, fail) => {
    const p = spawn(python, ["-m", "euclide_sidecar", "--run"], { cwd: resolve(root, "sidecar") });
    const events = [];
    let buffer = "";
    p.stdout.on("data", (chunk) => {
      buffer += chunk;
      for (let i; (i = buffer.indexOf("\n")) >= 0;) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 1);
        if (line.trim()) events.push(JSON.parse(line));
      }
    });
    p.on("error", fail);
    p.on("close", () => ok(events));
    p.stdin.write(
      JSON.stringify({ code, name: `${name}.py`, cwd: null, checks: checks ? { source: "" } : null }) + "\n",
    );
  });
}

const out = {};
for (const s of SCRIPTS) {
  const events = await run(s);
  out[`${s.name}.py`] = events;
  console.log(s.name, events.map((e) => e.t).join(","));
}
writeFileSync(resolve(here, "run-events.json"), JSON.stringify({ scripts: SCRIPTS, events: out }));
