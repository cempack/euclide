# Modèle : Bienaymé-Tchebychev
# Résumé : La borne de l'inégalité face à la fréquence observée.

# Inégalité de Bienaymé-Tchebychev : P(|X − E(X)| ≥ δ) ≤ V(X) / δ².
# X : le nombre de « pile » en 100 lancers d'une pièce, de loi B(100 ; 0,5),
# d'espérance 50 et de variance 25. On compare la borne, la probabilité exacte
# et la fréquence observée sur 2000 simulations.
from math import comb
from random import random


def borne(variance, delta):
    """La borne V / δ² de l'inégalité, ramenée à 1 quand elle le dépasse.

    >>> borne(25, 10)
    0.25
    >>> borne(25, 2)
    1.0
    """
    return min(1.0, variance / delta**2)


def proba_ecart(n, p, delta):
    """P(|X − np| ≥ delta) pour X de loi B(n, p), calculée exactement.

    >>> proba_ecart(2, 0.5, 1)
    0.5
    >>> proba_ecart(2, 0.5, 2)
    0
    """
    esperance = n * p
    return sum(comb(n, k) * p**k * (1 - p) ** (n - k) for k in range(n + 1) if abs(k - esperance) >= delta)


def nombre_de_piles(n):
    """Le nombre de « pile » en n lancers d'une pièce équilibrée.

    >>> 0 <= nombre_de_piles(100) <= 100
    True
    """
    return sum(1 for _ in range(n) if random() < 0.5)


n, p = 100, 0.5
esperance, variance = n * p, n * p * (1 - p)
simulations = [nombre_de_piles(n) for _ in range(2000)]

print("  δ    borne V/δ²   P exacte   fréquence observée")
for delta in (5, 10, 15, 20):
    exacte = proba_ecart(n, p, delta)
    observee = sum(1 for x in simulations if abs(x - esperance) >= delta) / len(simulations)
    print(f"{delta:3}      {borne(variance, delta):.4f}     {exacte:.4f}      {observee:.4f}")
print()
print("L'inégalité est toujours vérifiée, mais la borne est souvent bien plus grande que")
print("la probabilité : elle n'utilise que l'espérance et la variance, rien d'autre de la loi.")
