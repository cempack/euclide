# Euclide

**Le bureau d'enseignement** — un assistant de classe local, portable et beau, qui tient sur une clé USB.

Conçu avec soin par **Elliot Moreau**, en hommage à un grand professeur de mathématiques et NSI. Nommé *Euclide* d'après les *Éléments* d'Euclide, modèle fondateur de l'enseignement rigoureux et structuré des mathématiques.

> Euclide n'est pas un logiciel compliqué : c'est un seul bureau d'enseignement élégant, dans une clé USB. Le but est de gagner du temps, réduire les frictions et rendre le quotidien plus fluide.

---

## Ce que fait Euclide

- **Tableau de bord** : un accueil « Bonjour », le cours en cours / à venir, les rappels, les fichiers récents et des actions rapides.
- **Onglets** : ouvrez plusieurs cours, documents et tableaux côte à côte, comme dans un navigateur.
- **Palette de commandes** (⌘K) et **raccourcis clavier** (bouton « ? » ou ⌘/) pour tout faire au clavier.
- **Cours** : un espace par classe ou matière, avec notes Markdown et fichiers attachés.
- **Documents** : recherche plein texte instantanée (y compris dans les PDF) et lecteur intégré.
- **PDF annotables** : stylo, surligneur et texte par-dessus le PDF, annotations sauvegardées et export d'une copie annotée.
- **Tableau blanc** : format vectoriel maison `.euboard`, toujours **modifiable** (on ne perd jamais ses traits), avec export PNG optionnel.
- **Outils** : démos Python, liens rapides, et mode « garder l'écran allumé ».
- **Apparence** : thème clair / sombre, **couleur d'accent au choix**, et matériau translucide natif (vibrancy macOS / Mica Windows).
- **Recap** : un petit bilan façon *Wrapped* de ce qui a été fait.
- **Pronote** : connexion par **QR code** (adaptée aux ENT, sans mot de passe à taper) **ou par identifiants directs** (comptes hors ENT / démonstration).

Tout est **local** : aucune donnée ne quitte la clé.

## Architecture

| Couche | Technologie |
| --- | --- |
| Coquille | Tauri 2 (Rust) → exécutable portable |
| Interface | React + TypeScript + Vite + Tailwind (thème inspiré de libadwaita / macOS) |
| Données | SQLite + fichiers dans un dossier racine configurable (via Réglages). Par défaut : `Euclide-Data/` à côté de l'exécutable. Pointeur stocké dans `euclide-data.json` (portable). |
| Tâches lourdes | Sidecar Python (Pronote via `pronotepy`, extraction PDF, démos) |

Le dossier de données (par défaut `Euclide-Data/`) est créé automatiquement. **Depuis Réglages → Dossier de stockage** vous pouvez pointer sur n'importe quel dossier (idéal sur une clé USB). Le choix est stocké dans `euclide-data.json` à côté de l'exécutable pour rester 100 % portable. La clé USB peut ainsi transporter l'exécutable + le sidecar + le pointeur config.

```
Euclide-Data/
├── euclide.db       # base SQLite (cours, notes, rappels, index de recherche, ...)
├── courses/<id>/    # fichiers attachés par cours
├── documents/       # PDF et ressources
├── whiteboards/     # tableaux blancs enregistrés (PNG)
└── python/          # démos Python (.py) lançables depuis Outils
```

## Développement

Prérequis : Node 18+, Rust (stable), et Python 3 (pour le sidecar en dev).

```bash
npm install        # dépendances de l'interface
npm run app        # lance Euclide en mode développement (Tauri + Vite)
```

Autres commandes utiles :

```bash
npm run build      # vérifie les types + build l'interface
npm run app:build  # produit l'exécutable de distribution
```

Pour tester Pronote / l'extraction PDF en développement, créez un environnement Python avec les dépendances du sidecar puis pointez Euclide dessus :

```bash
python3 -m venv sidecar/.venv
sidecar/.venv/bin/pip install -r sidecar/requirements.txt
# lancer Euclide en utilisant ce Python pour le sidecar
EUCLIDE_PYTHON="$(pwd)/sidecar/.venv/bin/python" npm run app
```

## Sidecar Python

En développement, Euclide utilise le Python du système (ou un venv pointé via `EUCLIDE_PYTHON`). Pour la distribution, on fige le sidecar en un seul binaire (aucun Python requis sur les PC de l'école) :

```bash
# macOS / Linux
bash sidecar/build_sidecar.sh

# Windows (PowerShell)
.\sidecar\build_sidecar.ps1
```

Le binaire (`euclide-sidecar` ou `.exe`) produit doit être placé à côté de l'exécutable Euclide (ou dans les ressources de l'app avant `npm run app:build`). Euclide le détecte automatiquement ; sinon il retombe sur le Python du système (python / python3). 

Le sidecar Python (pronotepy + pypdf) est multi-plateforme ; le binaire PyInstaller doit être produit **sur la plateforme cible**.

## CI / GitHub Actions (builds for macOS, Windows, Linux)

Push a tag `vX.Y.Z` (or use "Run workflow" in Actions) to automatically build on GitHub-hosted runners:

- macOS Intel (via macos-13) → x86_64 .dmg etc.
- macOS Apple Silicon (macos-latest) → aarch64
- Linux (ubuntu-22.04) → .AppImage, .deb, .rpm
- Windows → .exe / nsis installer

The workflow:
- Builds the platform-specific Python sidecar binary (via PyInstaller) and bundles it.
- Runs `tauri build` for the native targets using official `tauri-apps/tauri-action`.
- Creates a draft GitHub Release with all artifacts.

See `.github/workflows/publish.yml` for the matrix and steps (based on official Tauri v2 guide + custom sidecar integration).

To customize release (e.g. auto publish instead of draft), edit the action inputs. Code signing for prod releases is recommended (separate guides for macOS/Windows).

## Connexion Pronote (par QR code)

L'établissement utilise un ENT : on ne tape donc jamais le mot de passe. On passe par le QR code de l'app mobile Pronote.

1. Application mobile Pronote → **Mon compte → Générer un QR code**.
2. Choisir un **code PIN à 4 chiffres** (à retenir).
3. Faire une **capture d'écran** du QR code.
4. Dans Euclide : **Réglages → Connexion Pronote → Connecter**, importer l'image et saisir le PIN.

> Le QR code n'est valable que **10 minutes**. Euclide stocke ensuite un jeton de connexion qui **change à chaque session** et qu'il ré-enregistre automatiquement — c'est volontaire et nécessaire pour rester connecté.

Techniquement, le sidecar appelle `pronotepy.Client.qrcode_login(qr, pin, uuid)` puis `token_login(...)` lors des sessions suivantes, avec un `uuid` stable. Le mode « identifiants directs » utilise simplement `pronotepy.Client(url, identifiant, mot_de_passe)` (testé avec le compte de démonstration Index Éducation, espace professeur).

## Utilisation depuis une clé USB (Windows / Linux)

1. Construire l'app (`npm run app:build`) et le sidecar (`.sh` sur mac/linux ou `.ps1` sur Windows).
2. Copier l'exécutable (`Euclide` ou `Euclide.exe`), le binaire sidecar correspondant (à côté) sur la clé.
3. Au premier lancement, Euclide crée le dossier `Euclide-Data/` à côté de l'exécutable.
4. Sur Windows : WebView2 requis (bootstrapper embarqué si besoin). Sur Linux : dépendances gtk/webkit typiques pour Tauri (la plupart des distros desktop les ont).

Le mode « garder l'écran allumé » (caffeinate) fonctionne nativement sur Windows, macOS et Linux.

> Astuce : un exécutable non signé lancé depuis une clé peut être signalé par l'antivirus. La signature de code est une amélioration prévue.

---

Fait avec attention, pour rendre chaque journée de classe un peu plus douce.

> Euclide — les *Éléments* comme modèle d'enseignement clair et durable.
