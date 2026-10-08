# Modèle : Programmation dynamique
# Résumé : Rendu de monnaie optimal, sous-problèmes mémorisés.

# Programmation dynamique : on résout chaque sous-problème une seule fois,
# et on mémorise sa solution pour la réutiliser au lieu de la recalculer.

appels = 0


def fibonacci_naif(n):
    """Le terme d'indice n de la suite de Fibonacci (0, 1, 1, 2, 3, 5…), sans mémoire.

    >>> fibonacci_naif(1)
    1
    >>> fibonacci_naif(10)
    55
    """
    global appels
    appels = appels + 1
    if n < 2:
        return n
    return fibonacci_naif(n - 1) + fibonacci_naif(n - 2)


def fibonacci_memo(n, memo=None):
    """Le même terme, en mémorisant dans un dictionnaire les termes déjà calculés.

    >>> fibonacci_memo(10)
    55
    >>> fibonacci_memo(100)
    354224848179261915075
    """
    if memo is None:
        memo = {}
    if n < 2:
        return n
    if n not in memo:
        memo[n] = fibonacci_memo(n - 1, memo) + fibonacci_memo(n - 2, memo)
    return memo[n]


def rendu_glouton(somme, pieces):
    """Les pièces rendues en prenant toujours la plus grande possible.

    >>> rendu_glouton(6, [1, 3, 4])
    [4, 1, 1]
    >>> rendu_glouton(0, [1, 3, 4])
    []
    """
    rendu = []
    for piece in sorted(pieces, reverse=True):
        while somme >= piece:
            rendu.append(piece)
            somme = somme - piece
    return rendu


def rendu_optimal(somme, pieces):
    """Une liste de pièces, la plus courte possible, de total somme (None si c'est impossible).

    >>> rendu_optimal(6, [1, 3, 4])
    [3, 3]
    >>> rendu_optimal(48, [1, 3, 6, 12, 24, 30])
    [24, 24]
    >>> rendu_optimal(7, [2, 4]) is None
    True
    """
    # meilleur[s] : le meilleur rendu de la somme s, calculé à partir des
    # sommes plus petites, déjà résolues (None si s ne peut pas être rendue).
    meilleur = [[]] + [None] * somme
    for s in range(1, somme + 1):
        for piece in pieces:
            if piece <= s and meilleur[s - piece] is not None:
                candidat = meilleur[s - piece] + [piece]
                if meilleur[s] is None or len(candidat) < len(meilleur[s]):
                    meilleur[s] = candidat
    return meilleur[somme]


print("fibonacci_naif(25) =", fibonacci_naif(25), f"en {appels} appels")
print("fibonacci_memo(25) =", fibonacci_memo(25), "en calculant chaque terme une seule fois")
print("fibonacci_memo(100) =", fibonacci_memo(100))

print()
print("Pièces de 1, 3 et 4 : là où le glouton ne trouve pas le minimum")
for somme in range(1, 13):
    glouton, optimal = rendu_glouton(somme, [1, 3, 4]), rendu_optimal(somme, [1, 3, 4])
    if len(glouton) > len(optimal):
        print(f"  {somme:>2} : glouton {glouton}, optimal {optimal}")
print("48 pence en anciennes pièces britanniques :", rendu_optimal(48, [1, 3, 6, 12, 24, 30]))
