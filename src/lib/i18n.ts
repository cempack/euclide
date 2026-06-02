// French is the only shipped locale, but strings live here so Euclide can be
// translated later without hunting through components.

export const fr = {
  appName: "Euclide",
  tagline: "Le bureau d'enseignement de Monsieur Madrias",
  madeBy: "Concu avec soin par Elliot Moreau",

  nav: {
    dashboard: "Tableau de bord",
    courses: "Cours",
    documents: "Documents",
    tools: "Outils",
    recap: "Recap",
    settings: "Reglages",
  },

  greetingMorning: "Bonjour Monsieur Madrias",
  greetingAfternoon: "Bon apres-midi Monsieur Madrias",
  greetingEvening: "Bonsoir Monsieur Madrias",

  todayClasses: "Les cours d'aujourd'hui",
  noClassesToday: "Aucun cours prevu aujourd'hui. Profitez du calme.",
  reminders: "Rappels",
  noReminders: "Rien a retenir pour le moment.",
  recentFiles: "Fichiers recents",
  noRecentFiles: "Aucun fichier recent.",
  quickActions: "Actions rapides",

  newCourse: "Nouveau cours",
  newReminder: "Nouveau rappel",
  newNote: "Nouvelle note",
  newLink: "Nouveau lien",
  importFiles: "Importer des fichiers",
  search: "Rechercher",
  searchDocs: "Rechercher un document...",
  whiteboard: "Tableau blanc",
  pythonDemos: "Scripts Python",
  quickLinks: "Liens rapides",
  keepAwake: "Garder l'ecran allume",
  keepAwakeOn: "Euclide empeche la mise en veille",
  keepAwakeOff: "Veille normale",

  save: "Enregistrer",
  cancel: "Annuler",
  delete: "Supprimer",
  open: "Ouvrir",
  add: "Ajouter",
  close: "Fermer",
  done: "Termine",
  run: "Lancer",
  connect: "Connecter",

  pronoteTitle: "Connexion Pronote",
  pronoteHelp:
    "Comme votre etablissement utilise un ENT, la connexion se fait par QR code, sans saisir de mot de passe.",
};

export type Strings = typeof fr;
export const t = fr;
