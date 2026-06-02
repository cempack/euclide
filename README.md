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
| Données | SQLite (`Euclide-Data/euclide.db`) + dossier `Euclide-Data/` à côté de l'exécutable |
| Tâches lourdes | Sidecar Python (Pronote via `pronotepy`, extraction PDF, démos) |

Le dossier **`Euclide-Data/`** est créé automatiquement à côté de l'exécutable. C'est lui qui rend Euclide portable : la clé USB transporte toute la base, les cours, les documents et les tableaux blancs.

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

En développement, Euclide utilise le Python du système. Pour la distribution, on fige le sidecar en un seul binaire (aucun Python requis sur les PC de l'école) :

```bash
bash sidecar/build_sidecar.sh
```

Le binaire `euclide-sidecar` produit doit être placé à côté de l'exécutable Euclide (ou dans les ressources de l'app). Euclide le détecte automatiquement ; sinon il retombe sur le Python du système.

## Connexion Pronote (par QR code)

L'établissement utilise un ENT : on ne tape donc jamais le mot de passe. On passe par le QR code de l'app mobile Pronote.

1. Application mobile Pronote → **Mon compte → Générer un QR code**.
2. Choisir un **code PIN à 4 chiffres** (à retenir).
3. Faire une **capture d'écran** du QR code.
4. Dans Euclide : **Réglages → Connexion Pronote → Connecter**, importer l'image et saisir le PIN.

> Le QR code n'est valable que **10 minutes**. Euclide stocke ensuite un jeton de connexion qui **change à chaque session** et qu'il ré-enregistre automatiquement — c'est volontaire et nécessaire pour rester connecté.

Techniquement, le sidecar appelle `pronotepy.Client.qrcode_login(qr, pin, uuid)` puis `token_login(...)` lors des sessions suivantes, avec un `uuid` stable. Le mode « identifiants directs » utilise simplement `pronotepy.Client(url, identifiant, mot_de_passe)` (testé avec le compte de démonstration Index Éducation, espace professeur).

## Utilisation depuis une clé USB (Windows)

1. Construire l'app (`npm run app:build`) et le sidecar (`sidecar/build_sidecar.sh`).
2. Copier l'exécutable `Euclide.exe`, le binaire `euclide-sidecar.exe` (à côté) sur la clé.
3. Au premier lancement, Euclide crée le dossier `Euclide-Data/` à côté de l'exécutable.
4. Le runtime **WebView2** est requis (présent par défaut sur Windows 10/11) ; le programme d'installation embarque sinon le *bootstrapper*.

> Astuce : un exécutable non signé lancé depuis une clé peut être signalé par l'antivirus. La signature de code est une amélioration prévue.

---

Fait avec attention, pour rendre chaque journée de classe un peu plus douce.

> Euclide — les *Éléments* comme modèle d'enseignement clair et durable.
