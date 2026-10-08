# Modèle : Chemins dans un graphe
# Résumé : Matrice d'adjacence : Aⁿ compte les chemins de longueur n.

# Le coefficient (i, j) de Aⁿ est le nombre de chemins de longueur n
# (n arêtes, sommets répétés permis) qui vont du sommet i au sommet j.

SOMMETS = ["A", "B", "C", "D", "E"]
ARETES = [("A", "B"), ("A", "C"), ("B", "C"), ("B", "D"), ("C", "D"), ("D", "E")]  # graphe non orienté


def matrice_adjacence(sommets, aretes):
    """La matrice d'adjacence du graphe non orienté.

    >>> matrice_adjacence(["A", "B", "C"], [("A", "B"), ("B", "C")])
    [[0, 1, 0], [1, 0, 1], [0, 1, 0]]
    """
    n = len(sommets)
    M = [[0] * n for _ in range(n)]
    for x, y in aretes:
        i, j = sommets.index(x), sommets.index(y)
        M[i][j] = M[j][i] = 1
    return M


def produit(A, B):
    """Le produit de deux matrices carrées de même taille.

    >>> produit([[0, 1], [1, 0]], [[0, 1], [1, 0]])
    [[1, 0], [0, 1]]
    """
    n = len(A)
    return [[sum(A[i][k] * B[k][j] for k in range(n)) for j in range(n)] for i in range(n)]


def puissance(A, n):
    """Aⁿ, pour n ≥ 1.

    >>> puissance([[0, 1], [1, 0]], 3)
    [[0, 1], [1, 0]]
    """
    resultat = A
    for _ in range(n - 1):
        resultat = produit(resultat, A)
    return resultat


def lister_chemins(aretes, depart, arrivee, longueur):
    """Les chemins de depart à arrivee de la longueur donnée, écrits comme des mots.

    >>> lister_chemins([("A", "B"), ("B", "C")], "A", "C", 2)
    ['ABC']
    """
    voisins = {}
    for x, y in aretes:
        voisins.setdefault(x, []).append(y)
        voisins.setdefault(y, []).append(x)
    chemins = [depart]
    for _ in range(longueur):
        chemins = [c + v for c in chemins for v in voisins[c[-1]]]
    return sorted(c for c in chemins if c[-1] == arrivee)


A = matrice_adjacence(SOMMETS, ARETES)
for n in [1, 2, 3]:
    print(f"A^{n} :")
    print("     " + "  ".join(f"{s:>3}" for s in SOMMETS))
    for i, ligne in enumerate(puissance(A, n)):
        print(f"  {SOMMETS[i]}  " + "  ".join(f"{x:>3}" for x in ligne))
print()

depart, arrivee, n = "A", "E", 3
nombre = puissance(A, n)[SOMMETS.index(depart)][SOMMETS.index(arrivee)]
chemins = lister_chemins(ARETES, depart, arrivee, n)
print(f"Chemins de longueur {n} de {depart} à {arrivee} : {nombre} d'après A^{n}")
print("En les écrivant tous :", ", ".join(chemins))
