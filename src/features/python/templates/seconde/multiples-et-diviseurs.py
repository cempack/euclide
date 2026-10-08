# Modèle : Multiples et diviseurs
# Résumé : a est-il un multiple de b ? Les diviseurs d'un entier.

# a est un multiple de b s'il existe un entier k tel que a = k × b,
# c'est-à-dire si le reste de la division de a par b est nul.


def est_multiple(a, b):
    """Renvoie True si a est un multiple de b, False sinon.

    >>> est_multiple(42, 7)
    True
    >>> est_multiple(42, 5)
    False
    >>> est_multiple(0, 3)
    True
    """
    return a % b == 0


def diviseurs(n):
    """Renvoie la liste des diviseurs positifs de l'entier n ≥ 1.

    >>> diviseurs(12)
    [1, 2, 3, 4, 6, 12]
    >>> diviseurs(13)
    [1, 13]
    """
    liste = []
    for d in range(1, n + 1):
        if est_multiple(n, d):
            liste.append(d)
    return liste


print("42 est-il un multiple de 7 ?", est_multiple(42, 7))
print("42 est-il un multiple de 5 ?", est_multiple(42, 5))
print()

for n in [12, 13, 28, 60]:
    print(f"Diviseurs de {n} : {diviseurs(n)}")
print()

# Un nombre est parfait s'il est égal à la somme de ses diviseurs autres que lui-même.
for n in range(2, 500):
    if sum(diviseurs(n)) - n == n:
        print(n, "est un nombre parfait.")
