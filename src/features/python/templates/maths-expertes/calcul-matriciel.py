# Modèle : Calcul matriciel
# Résumé : Produit, puissance et inverse d'une matrice.

# Une matrice est une liste de lignes : [[1, 2], [3, 4]].
# Les fractions du module fractions gardent les inverses exacts.
from fractions import Fraction


def produit(A, B):
    """Le produit A × B (A a autant de colonnes que B a de lignes).

    >>> produit([[1, 2], [3, 4]], [[5, 6], [7, 8]])
    [[19, 22], [43, 50]]
    """
    lignes, colonnes, communs = len(A), len(B[0]), len(B)
    return [[sum(A[i][k] * B[k][j] for k in range(communs)) for j in range(colonnes)] for i in range(lignes)]


def identite(n):
    """La matrice identité de taille n.

    >>> identite(2)
    [[1, 0], [0, 1]]
    """
    return [[1 if i == j else 0 for j in range(n)] for i in range(n)]


def puissance(A, k):
    """A^k (k entier naturel), par produits successifs.

    >>> puissance([[1, 1], [1, 0]], 10)
    [[89, 55], [55, 34]]
    """
    resultat = identite(len(A))
    for _ in range(k):
        resultat = produit(resultat, A)
    return resultat


def inverse(A):
    """L'inverse d'une matrice 2 × 2 de déterminant non nul, en fractions.

    >>> B = inverse([[1, 2], [3, 4]])
    >>> [[str(x) for x in ligne] for ligne in B]
    [['-2', '1'], ['3/2', '-1/2']]
    >>> produit([[1, 2], [3, 4]], B) == identite(2)
    True
    """
    (a, b), (c, d) = A
    det = a * d - b * c
    if det == 0:
        raise ValueError("la matrice n'est pas inversible : son déterminant est nul")
    return [[Fraction(d, det), Fraction(-b, det)], [Fraction(-c, det), Fraction(a, det)]]


def afficher(nom, A):
    """Affiche la matrice ligne par ligne, colonnes alignées."""
    print(f"{nom} =")
    for ligne in A:
        print("   ", "  ".join(f"{str(x):>5}" for x in ligne))


A = [[2, 1], [5, 3]]
B = [[1, -1], [0, 2]]
afficher("A", A)
afficher("A × B", produit(A, B))
afficher("B × A", produit(B, A))  # en général, A × B ≠ B × A
afficher("A^5", puissance(A, 5))
afficher("A⁻¹", inverse(A))
print()

# Résoudre le système 2x + y = 5, 5x + 3y = 13 : AX = Y, donc X = A⁻¹Y.
Y = [[5], [13]]
X = produit(inverse(A), Y)
print(f"2x + y = 5 et 5x + 3y = 13 : x = {X[0][0]}, y = {X[1][0]}")
