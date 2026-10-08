# Modèle : Crible d'Ératosthène
# Résumé : Les nombres premiers jusqu'à n.

# On barre les multiples de chaque nombre premier p, à partir de p² :
# les nombres qui restent sont premiers.
from math import log


def crible(n):
    """La liste des nombres premiers inférieurs ou égaux à n.

    >>> crible(30)
    [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]
    >>> crible(1)
    []
    >>> len(crible(1000))
    168
    """
    est_premier = [k >= 2 for k in range(n + 1)]
    p = 2
    while p * p <= n:
        if est_premier[p]:
            for multiple in range(p * p, n + 1, p):
                est_premier[multiple] = False
        p = p + 1
    return [k for k in range(n + 1) if est_premier[k]]


premiers = crible(100)
print(f"Les {len(premiers)} nombres premiers jusqu'à 100 :")
for i in range(0, len(premiers), 10):
    print(" ".join(f"{p:3}" for p in premiers[i : i + 10]))
print()

# Combien y en a-t-il jusqu'à n ? À peu près n / ln(n) (théorème des nombres premiers).
print(f"{'n':>8} {'premiers ≤ n':>14} {'n / ln n':>10}")
for n in [100, 1000, 10_000, 100_000]:
    print(f"{n:>8} {len(crible(n)):>14} {n / log(n):>10.0f}")
