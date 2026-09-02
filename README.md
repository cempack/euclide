# Euclide

**Le bureau d'enseignement** — un assistant de classe local et portable, conçu par Elliot Moreau.

```bash
npm install && npm run app   # lancer en développement
npm run app:build             # produire l'exécutable (signé pour le updater)
npm run app:build:usb         # même chose sans artefacts d'update (clé USB locale)
```

## Mises à jour

Euclide utilise le [plugin updater Tauri](https://v2.tauri.app/plugin/updater/) : l’app interroge

`https://github.com/cempack/euclide/releases/latest/download/latest.json`

sur les releases GitHub publiées (`v*`). Le workflow `.github/workflows/publish.yml` s’appuie sur [`tauri-apps/tauri-action`](https://github.com/tauri-apps/tauri-action) pour signer les bundles et fusionner `latest.json` entre macOS, Linux et Windows. Les archives USB (`*-portable*`) restent jointes à la même release.

Sur **Windows portable** (exe + `euclide-sidecar` dans le même dossier, typiquement une clé USB), la mise à jour in-app télécharge `Euclide-windows-portable.zip` et **recouvre uniquement** `euclide.exe` et `euclide-sidecar/` **dans ce même dossier**. `Euclide-Data`, `euclide-data.json` et tout autre fichier à côté ne sont ni déplacés ni supprimés. Les copies installées avec NSIS continuent d’utiliser l’installateur (`windows-x86_64-nsis`).

### Secrets GitHub (obligatoires pour une release `v*`)

La signature des updates est obligatoire côté Tauri. Ne commitez jamais la clé privée.

```bash
npx tauri signer generate -w ~/.tauri/euclide.key
```

1. Copiez le contenu de `~/.tauri/euclide.key.pub` dans `src-tauri/tauri.conf.json` → `plugins.updater.pubkey` (doit correspondre à la clé privée des secrets).
2. Dépôt → Settings → Secrets and variables → Actions :
   - `TAURI_SIGNING_PRIVATE_KEY` : contenu de `~/.tauri/euclide.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` : mot de passe (vide si vous n’en avez pas mis)

Les tags `v*` publient une vraie release (pas un brouillon) pour que `/releases/latest` fonctionne. Un run manuel du workflow produit encore le brouillon `dev-build` (ignoré par le updater).
