# Modèle : Triangle de Pascal
# Résumé : Les coefficients binomiaux, ligne par ligne.

# Chaque coefficient est la somme des deux qui sont au-dessus de lui :
# C(n, k) = C(n − 1, k − 1) + C(n − 1, k).
from math import comb

EXPOSANTS = str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹")


def ligne_suivante(ligne):
    """La ligne du triangle qui suit la ligne donnée.

    >>> ligne_suivante([1])
    [1, 1]
    >>> ligne_suivante([1, 3, 3, 1])
    [1, 4, 6, 4, 1]
    """
    return [1] + [ligne[k - 1] + ligne[k] for k in range(1, len(ligne))] + [1]


def triangle(n):
    """Les lignes 0 à n du triangle de Pascal.

    >>> triangle(3)
    [[1], [1, 1], [1, 2, 1], [1, 3, 3, 1]]
    """
    lignes = [[1]]
    for _ in range(n):
        lignes.append(ligne_suivante(lignes[-1]))
    return lignes


def puissance(lettre, p):
    """La lettre à la puissance p, écrite comme au tableau.

    >>> puissance("a", 3), puissance("b", 1), puissance("b", 0)
    ('a³', 'b', '')
    """
    if p == 0:
        return ""
    if p == 1:
        return lettre
    return lettre + str(p).translate(EXPOSANTS)


def developpement(n):
    """Le développement de (a + b)ⁿ, avec les coefficients de la ligne n.

    >>> developpement(2)
    'a² + 2ab + b²'
    >>> developpement(3)
    'a³ + 3a²b + 3ab² + b³'
    """
    termes = []
    for k, c in enumerate(triangle(n)[n]):
        coefficient = str(c) if c != 1 else ""
        termes.append(coefficient + puissance("a", n - k) + puissance("b", k) or "1")
    return " + ".join(termes)


N = 10
lignes = triangle(N)
for ligne in lignes:
    print("".join(f"{c:4}" for c in ligne).center(4 * (N + 1)).rstrip())

print()
identiques = all(lignes[n][k] == comb(n, k) for n in range(N + 1) for k in range(n + 1))
print("Les mêmes valeurs que math.comb :", identiques)
print(f"Somme de la ligne {N} : {sum(lignes[N])} = 2{str(N).translate(EXPOSANTS)}")
print(f"(a + b)⁵ = {developpement(5)}")
