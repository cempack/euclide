<p align="center"><img src="public/logo.svg" alt="" width="72" height="72"></p>
<h1 align="center">Euclide</h1>
<p align="center">Le bureau d'enseignement</p>
<p align="center">
  <a href="https://github.com/cempack/euclide/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/cempack/euclide?style=flat-square"></a>
</p>

<p align="center">
  <img src="docs/dashboard.jpg" alt="Euclide" width="960">
</p>

Euclide is an offline teaching desk for one maths and NSI teacher: courses
and their progression, documents and annotated PDFs, notes that print and
present, a geometry whiteboard, a Python workspace, Pronote's timetable and
cahier de textes. It runs from a USB key on school PCs (Windows, WebView2)
and on Linux.

## Developing

Prerequisites: Node.js LTS, Rust stable, Python 3.12, and Tauri's system
dependencies (WebKitGTK 4.1 on Linux; WebView2, present on Windows 10/11).

```bash
npm install
python3 -m venv sidecar/.venv
sidecar/.venv/bin/pip install -r sidecar/requirements.txt   # Windows: sidecar\.venv\Scripts\pip
npm run app          # the desktop app, hot-reloading (Vite on :1420)
npm run dev          # the interface alone in a browser, on sample data (src/dev/mock-backend.ts)
```

In development the Python sidecar runs from `sidecar/` with the venv's
Python (or `EUCLIDE_PYTHON`); data lives in `src-tauri/target/debug/Euclide-Data`.

### Checks

```bash
npm run lint && npm run typecheck && npm test        # ESLint + design lint, tsc, Vitest
cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test
cd sidecar && python -m unittest discover -s tests -t . && ruff check .
PW_CHROMIUM=/usr/bin/chromium SHOTS_STRICT=1 npm run shots   # screenshots of every screen, pixel-exact
```

Reference screenshots live in `.shots/` (not committed): `npm run shots:update`
records them, and each change to the interface is reviewed against them.

### Building

```bash
sidecar/build_sidecar.sh     # freezes the sidecar (Windows: build_sidecar.ps1) into sidecar/dist
cp -r sidecar/dist/euclide-sidecar src-tauri/resources/
npm run app:build            # installer and updater artifacts
npm run app:build:usb        # the portable build for a USB key
```

### Where things are

- `src/shell`, `src/screens`, `src/features/*`: the window, the screens, and
  the larger features (board, pdf, python, notes, classroom, settings).
- `src/ui`: the component kit; `src/stores`: zustand stores; `src/api`:
  TanStack Query (queries, `changed(scope)`); `src/locales/strings.json`:
  every message.
- `src-tauri/src`: commands, the database and its migrations (`db/`), the
  sidecar and script runner, backups (`jobs/`), printing (`print/`).
- `sidecar/euclide_sidecar`: Pronote, completion, PDF text, and the script
  runner with its turtle and pyplot stand-ins.

### Data

Everything is in `Euclide-Data/`, next to the executable unless moved in
Réglages. The database carries its format (`PRAGMA user_version`); Euclide
copies it aside before migrating and refuses data written by a newer
version. Daily copies go to `Euclide-Sauvegardes/` beside it.

### Releases

Every push to `main` publishes a release (`.github/workflows/publish.yml`):
work happens on other branches, and `preview.yml` builds test versions by
hand. A push publishes the next patch version; for a minor one, set the
version (`python3 scripts/set-release-version.py --set 0.4.0`), commit, and
push a `v0.4.0` tag.

What changed goes in `CHANGELOG.md`, with pictures from `scripts/changelog/`,
on the sample data (`npm run dev` running):

```sh
node scripts/sample-documents.mjs                    # the sample data's documents and previews
node scripts/changelog/run-events.mjs                # real Python output to replay
node scripts/changelog/capture.mjs                   # the screens, at 2×
node scripts/changelog/recap.mjs                     # the keynote: slides, overview, PDF
node scripts/changelog/release-notes.mjs 0.4.0 | gh release edit v0.4.0 --notes-file -
```

Both write to `scripts/changelog/shots/` (not committed); the pictures the
changelog shows are copied to `docs/changelog/<version>/`.
