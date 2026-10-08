# Modèle : Espérance, variance, écart type
# Résumé : D'une loi donnée, puis observées sur une simulation.

# Un jeu : on lance un dé. On gagne 5 € avec un 6, 1 € avec un 4 ou un 5,
# et on perd 2 € sinon. X est le gain. Le jeu est-il favorable au joueur ?
import math
import statistics
from fractions import Fraction
from random import randint


def esperance(valeurs, probabilites):
    """E(X) = x_1 × p_1 + x_2 × p_2 + …

    >>> esperance([0, 1], [0.5, 0.5])
    0.5
    """
    total = 0
    for i in range(len(valeurs)):
        total = total + valeurs[i] * probabilites[i]
    return total


def variance(valeurs, probabilites):
    """V(X) = p_1 × (x_1 − E(X))² + p_2 × (x_2 − E(X))² + …

    >>> variance([0, 1], [0.5, 0.5])
    0.25
    """
    e = esperance(valeurs, probabilites)
    total = 0
    for i in range(len(valeurs)):
        total = total + probabilites[i] * (valeurs[i] - e) ** 2
    return total


def gain():
    """Le gain d'une partie : on lance le dé.

    >>> gain() in [5, 1, -2]
    True
    """
    de = randint(1, 6)
    if de == 6:
        return 5
    if de >= 4:
        return 1
    return -2


valeurs = [5, 1, -2]
probabilites = [Fraction(1, 6), Fraction(2, 6), Fraction(3, 6)]
E = esperance(valeurs, probabilites)
V = variance(valeurs, probabilites)
print("Loi de X :", ", ".join(f"P(X = {valeurs[i]}) = {probabilites[i]}" for i in range(len(valeurs))))
print(f"E(X) = {E} ≈ {float(E):.4f}")
print(f"V(X) = {V} ≈ {float(V):.4f}")
print(f"σ(X) = √V(X) ≈ {math.sqrt(V):.4f}")

N = 10000
gains = [gain() for _ in range(N)]
print(f"\nSur {N} parties simulées :")
print(f"moyenne des gains ≈ {statistics.mean(gains):.4f}")
print(f"variance          ≈ {statistics.pvariance(gains):.4f}")
print(f"écart type        ≈ {statistics.pstdev(gains):.4f}")
