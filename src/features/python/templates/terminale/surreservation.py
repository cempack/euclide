# Modèle : Surréservation
# Résumé : Le plus petit k tel que P(X > k) ≤ α.

# Une compagnie vend n billets ; chaque passager se présente avec la
# probabilité p = 0,95, indépendamment des autres. X, le nombre de passagers
# présents, suit la loi B(n, p). Combien de places faut-il pour que le risque
# de devoir refuser un passager, P(X > k), ne dépasse pas α = 5 % ?
from math import comb


def proba(n, p, k):
    """P(X = k) pour X de loi B(n, p).

    >>> proba(2, 0.5, 1)
    0.5
    """
    return comb(n, k) * p**k * (1 - p) ** (n - k)


def plus_petit_k(n, p, alpha):
    """Le plus petit entier k tel que P(X > k) ≤ alpha, pour X de loi B(n, p).

    >>> plus_petit_k(10, 0.5, 0.5)
    5
    >>> plus_petit_k(10, 0.5, 0.01)
    9
    """
    k = 0
    cumul = proba(n, p, 0)  # P(X ≤ k)
    while k < n and 1 - cumul > alpha:
        k = k + 1
        cumul = cumul + proba(n, p, k)
    return k


def risque(n, p, places):
    """P(X > places) : la probabilité qu'il y ait plus de passagers que de places.

    >>> risque(10, 0.5, 10)
    0
    >>> round(risque(2, 0.5, 1), 2)
    0.25
    """
    return sum(proba(n, p, k) for k in range(places + 1, n + 1))


p, alpha = 0.95, 0.05
n = 320
k = plus_petit_k(n, p, alpha)
print(f"{n} billets vendus : le plus petit k tel que P(X > k) ≤ 5 % est k = {k}.")
print(f"   P(X > {k}) = {risque(n, p, k):.4f}, mais P(X > {k - 1}) = {risque(n, p, k - 1):.4f}.")

print()
places = 300
print(f"Un avion de {places} places : combien de billets vendre au plus ?")
billets = places
for essai in range(places + 4, places + 13):
    r = risque(essai, p, places)
    print(f"   {essai} billets : risque {100 * r:5.2f} %" + ("" if r <= alpha else "   trop risqué"))
    if r <= alpha:
        billets = essai
print(f"La compagnie peut vendre jusqu'à {billets} billets.")
