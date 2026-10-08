# Modèle : Loi binomiale
# Résumé : P(X = k), P(X ≤ k) et le diagramme en barres.

# Un QCM de 20 questions, 4 réponses dont une seule juste. Un élève répond au
# hasard : X, le nombre de bonnes réponses, suit la loi binomiale B(20 ; 0,25).
# P(X = k) = C(n, k) × p^k × (1 − p)^(n − k).
from math import comb, sqrt

import matplotlib.pyplot as plt


def proba(n, p, k):
    """P(X = k) pour X de loi B(n, p).

    >>> proba(2, 0.5, 1)
    0.5
    >>> round(proba(10, 0.3, 3), 4)
    0.2668
    """
    return comb(n, k) * p**k * (1 - p) ** (n - k)


def proba_cumulee(n, p, k):
    """P(X ≤ k) pour X de loi B(n, p).

    >>> proba_cumulee(2, 0.5, 1)
    0.75
    >>> round(proba_cumulee(10, 0.3, 3), 4)
    0.6496
    """
    return sum(proba(n, p, i) for i in range(k + 1))


n, p = 20, 0.25
print("  k    P(X = k)   P(X ≤ k)")
for k in range(13):
    print(f"{k:3}    {proba(n, p, k):.4f}     {proba_cumulee(n, p, k):.4f}")
print()
print(f"E(X) = np = {n * p:g} bonnes réponses, σ(X) = {sqrt(n * p * (1 - p)):.2f}")
print(f"P(X ≥ 10) = 1 − P(X ≤ 9) = {1 - proba_cumulee(n, p, 9):.4f} : avoir la moyenne au hasard est rare.")

plt.bar(range(n + 1), [proba(n, p, k) for k in range(n + 1)])
plt.title("Loi binomiale B(20 ; 0,25)")
plt.xlabel("k (bonnes réponses)")
plt.ylabel("P(X = k)")
plt.show()
