# Modèle : Tableaux à deux dimensions
# Résumé : Une grille en liste de listes : créer, lire, parcourir.

# Un tableau à deux dimensions est une liste de lignes : t[i][j] est
# l'élément de la ligne i et de la colonne j.


def creer_grille(lignes, colonnes, valeur):
    """Une grille de lignes × colonnes cases, toutes égales à valeur.

    >>> creer_grille(2, 3, 0)
    [[0, 0, 0], [0, 0, 0]]
    >>> creer_grille(1, 2, "")
    [['', '']]
    """
    return [[valeur] * colonnes for _ in range(lignes)]


def moyennes_des_lignes(t):
    """La moyenne de chaque ligne de t.

    >>> moyennes_des_lignes([[10, 12], [8, 18]])
    [11.0, 13.0]
    >>> moyennes_des_lignes([[5]])
    [5.0]
    """
    return [sum(ligne) / len(ligne) for ligne in t]


def moyennes_des_colonnes(t):
    """La moyenne de chaque colonne de t (toutes les lignes ont la même longueur).

    >>> moyennes_des_colonnes([[10, 12], [8, 18]])
    [9.0, 15.0]
    >>> moyennes_des_colonnes([[1, 2, 3]])
    [1.0, 2.0, 3.0]
    """
    nb_lignes, nb_colonnes = len(t), len(t[0])
    moyennes = []
    for j in range(nb_colonnes):
        somme = 0
        for i in range(nb_lignes):
            somme = somme + t[i][j]
        moyennes.append(somme / nb_lignes)
    return moyennes


# Les notes de trois élèves (les lignes) à quatre devoirs (les colonnes).
notes = [
    [12, 15, 9, 14],
    [8, 11, 14, 10],
    [17, 13, 16, 18],
]
print("Note du 2e élève au 3e devoir :", notes[1][2])
for i in range(len(notes)):
    print(f"  élève {i + 1} :", "  ".join(f"{n:>2}" for n in notes[i]))
print("Moyenne de chaque élève :", moyennes_des_lignes(notes))
print("Moyenne de chaque devoir :", [round(m, 1) for m in moyennes_des_colonnes(notes)])

# Le piège : [[0] * 3] * 2 répète deux fois la même ligne (ce n'est pas une copie).
piege = [[0] * 3] * 2
piege[0][0] = 1
correcte = creer_grille(2, 3, 0)
correcte[0][0] = 1
print()
print("t = [[0] * 3] * 2 puis t[0][0] = 1 :", piege)
print("t = creer_grille(2, 3, 0) puis t[0][0] = 1 :", correcte)
