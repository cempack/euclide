# Modèle : Fermat et Carmichael
# Résumé : Témoins de non-primalité, et nombres de Carmichael.

# Petit théorème de Fermat : si p est premier et ne divise pas a, a^(p−1) ≡ 1 (mod p).
# Donc si a^(n−1) mod n ≠ 1, a prouve que n n'est pas premier : a est un témoin.
# Un nombre de Carmichael est composé, mais n'a aucun témoin premier avec lui.
from math import gcd


def est_premier(n):
    """Vrai si n est premier (divisions jusqu'à √n).

    >>> [n for n in range(20) if est_premier(n)]
    [2, 3, 5, 7, 11, 13, 17, 19]
    """
    if n < 2:
        return False
    d = 2
    while d * d <= n:
        if n % d == 0:
            return False
        d = d + 1
    return True


def est_temoin(a, n):
    """Vrai si a^(n−1) mod n ≠ 1 : a prouve que n n'est pas premier.

    >>> est_temoin(2, 15)
    True
    >>> est_temoin(2, 13)
    False
    """
    return pow(a, n - 1, n) != 1


def premier_temoin(n):
    """Le plus petit témoin de n premier avec n, ou None s'il n'y en a pas.

    >>> premier_temoin(91)
    2
    >>> premier_temoin(341)
    3
    >>> premier_temoin(561) is None
    True
    """
    for a in range(2, n):
        if gcd(a, n) == 1 and est_temoin(a, n):
            return a
    return None


def est_carmichael(n):
    """Vrai si n est composé mais sans témoin premier avec lui.

    >>> est_carmichael(561)
    True
    >>> est_carmichael(563)
    False
    """
    return n > 2 and not est_premier(n) and premier_temoin(n) is None


n = 341
print(f"2^{n - 1} mod {n} = {pow(2, n - 1, n)} : la base 2 ne voit rien, et pourtant {n} = 11 × 31.")
print(f"3^{n - 1} mod {n} = {pow(3, n - 1, n)} : 3 est un témoin, {n} n'est pas premier.")
print()

menteurs = [n for n in range(3, 1000, 2) if not est_premier(n) and not est_temoin(2, n)]
print("Composés que la base 2 ne démasque pas, sous 1 000 :", menteurs)

carmichael = [n for n in range(3, 10_000, 2) if est_carmichael(n)]
print("Nombres de Carmichael sous 10 000 :", carmichael)
print("Exemple : 561 = 3 × 11 × 17, et a^560 ≡ 1 (mod 561) pour tout a premier avec 561.")
