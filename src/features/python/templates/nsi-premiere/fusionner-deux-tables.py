# Modèle : Fusionner deux tables
# Résumé : Joindre deux tables sur une colonne commune.

# Deux tables : les élèves, avec leur classe, et les classes, avec leur
# professeur principal et leur salle. On les réunit sur la colonne « classe ».

eleves = [
    {"nom": "Léa", "classe": "1G1"},
    {"nom": "Hugo", "classe": "1G2"},
    {"nom": "Inès", "classe": "1G1"},
    {"nom": "Noah", "classe": "1G3"},
]
classes = [
    {"classe": "1G1", "professeur": "M. Garnier", "salle": "B12"},
    {"classe": "1G2", "professeur": "Mme Lefèvre", "salle": "A04"},
]


def concatener(table1, table2):
    """Les lignes de table1 puis celles de table2 qui n'y sont pas déjà (mêmes descripteurs).

    >>> concatener([{"nom": "Léa"}], [{"nom": "Hugo"}, {"nom": "Léa"}])
    [{'nom': 'Léa'}, {'nom': 'Hugo'}]
    >>> concatener([], [])
    []
    """
    resultat = list(table1)
    for ligne in table2:
        if ligne not in resultat:
            resultat.append(ligne)
    return resultat


def jointure(table1, table2, colonne):
    """Chaque ligne de table1 complétée par la ligne de table2 de même valeur dans la colonne.
    Les lignes sans correspondance sont écartées.

    >>> jointure([{"id": 1, "a": "x"}], [{"id": 1, "b": "y"}, {"id": 2, "b": "z"}], "id")
    [{'id': 1, 'a': 'x', 'b': 'y'}]
    >>> jointure([{"id": 3, "a": "x"}], [{"id": 1, "b": "y"}], "id")
    []
    """
    resultat = []
    # Deux boucles imbriquées : n × m comparaisons.
    for ligne1 in table1:
        for ligne2 in table2:
            if ligne1[colonne] == ligne2[colonne]:
                ligne = dict(ligne1)
                ligne.update(ligne2)
                resultat.append(ligne)
    return resultat


def jointure_rapide(table1, table2, colonne):
    """La même jointure, quand chaque valeur de la colonne n'apparaît qu'une fois dans table2.

    >>> jointure_rapide([{"id": 1, "a": "x"}], [{"id": 1, "b": "y"}, {"id": 2, "b": "z"}], "id")
    [{'id': 1, 'a': 'x', 'b': 'y'}]
    >>> jointure_rapide([{"id": 3, "a": "x"}], [{"id": 1, "b": "y"}], "id")
    []
    """
    # On range table2 dans un dictionnaire indexé par la colonne : n + m étapes.
    index = {ligne[colonne]: ligne for ligne in table2}
    resultat = []
    for ligne1 in table1:
        if ligne1[colonne] in index:
            ligne = dict(ligne1)
            ligne.update(index[ligne1[colonne]])
            resultat.append(ligne)
    return resultat


arrivees = [{"nom": "Inès", "classe": "1G1"}, {"nom": "Jade", "classe": "1G2"}]
eleves = concatener(eleves, arrivees)
print("Élèves, avec les arrivées :", ", ".join(eleve["nom"] for eleve in eleves))

print()
fusion = jointure(eleves, classes, "classe")
for ligne in fusion:
    print(f"  {ligne['nom']:<5} {ligne['classe']}  {ligne['professeur']:<12} salle {ligne['salle']}")
print("Même résultat avec l'index :", fusion == jointure_rapide(eleves, classes, "classe"))

connues = [c["classe"] for c in classes]
sans_classe = [eleve["nom"] for eleve in eleves if eleve["classe"] not in connues]
print("Sans correspondance dans la table des classes :", ", ".join(sans_classe))
