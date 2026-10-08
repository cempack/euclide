# Modèle : Sélectionner et trier
# Résumé : Filtrer les lignes, garder des colonnes, trier.

# Une table de livres : on sélectionne des lignes par des critères (et, ou,
# non), on ne garde que certaines colonnes (projection), on trie.

livres = [
    {"titre": "Candide", "auteur": "Voltaire", "annee": 1759, "genre": "conte"},
    {"titre": "Le Rouge et le Noir", "auteur": "Stendhal", "annee": 1830, "genre": "roman"},
    {"titre": "Notre-Dame de Paris", "auteur": "Hugo", "annee": 1831, "genre": "roman"},
    {"titre": "Madame Bovary", "auteur": "Flaubert", "annee": 1857, "genre": "roman"},
    {"titre": "Les Misérables", "auteur": "Hugo", "annee": 1862, "genre": "roman"},
    {"titre": "Germinal", "auteur": "Zola", "annee": 1885, "genre": "roman"},
    {"titre": "L'Étranger", "auteur": "Camus", "annee": 1942, "genre": "roman"},
    {"titre": "Le Petit Prince", "auteur": "Saint-Exupéry", "annee": 1943, "genre": "conte"},
]


def selection(table, critere):
    """Les lignes de la table qui vérifient le critère (une fonction qui renvoie un booléen).

    >>> t = [{"x": 1}, {"x": 5}, {"x": 3}]
    >>> selection(t, lambda ligne: ligne["x"] > 2)
    [{'x': 5}, {'x': 3}]
    >>> selection(t, lambda ligne: ligne["x"] > 9)
    []
    """
    return [ligne for ligne in table if critere(ligne)]


def projection(table, colonnes):
    """La table réduite aux colonnes données.

    >>> projection([{"a": 1, "b": 2, "c": 3}], ["a", "c"])
    [{'a': 1, 'c': 3}]
    >>> projection([{"a": 1, "b": 2}, {"a": 3, "b": 4}], ["b"])
    [{'b': 2}, {'b': 4}]
    """
    return [{c: ligne[c] for c in colonnes} for ligne in table]


def titres(table):
    """Les titres de la table, séparés par des virgules.

    >>> titres([{"titre": "Candide"}, {"titre": "Germinal"}])
    'Candide, Germinal'
    >>> titres([])
    ''
    """
    return ", ".join(ligne["titre"] for ligne in table)


xixe = selection(livres, lambda livre: 1801 <= livre["annee"] <= 1900)
print("Du XIXe siècle :", titres(xixe))
hugo_ou_conte = selection(livres, lambda livre: livre["auteur"] == "Hugo" or livre["genre"] == "conte")
print("De Hugo, ou des contes :", titres(hugo_ou_conte))
romans = selection(livres, lambda livre: livre["genre"] == "roman" and not livre["auteur"] == "Hugo")
print("Les romans, sauf ceux de Hugo :", titres(romans))
contes = selection(livres, lambda livre: livre["genre"] == "conte")
print("Les contes, titre et auteur :", projection(contes, ["titre", "auteur"]))

print()
recents = sorted(livres, key=lambda livre: livre["annee"], reverse=True)
print("Du plus récent au plus ancien :", titres(recents))
print("Par auteur, puis par année :")
for livre in sorted(livres, key=lambda livre: (livre["auteur"], livre["annee"])):
    print(f"  {livre['auteur']:<14} {livre['annee']}  {livre['titre']}")
