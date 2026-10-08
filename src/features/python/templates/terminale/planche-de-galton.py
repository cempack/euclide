# Modèle : Planche de Galton
# Résumé : Des billes, des clous : la loi binomiale apparaît.

# À chaque rangée de clous, la bille part à gauche ou à droite, avec la même
# probabilité. Le numéro de sa case est le nombre de fois où elle est partie à
# droite : il suit la loi binomiale B(n ; 0,5), n étant le nombre de rangées.
from math import comb
from random import random

import matplotlib.pyplot as plt

RANGEES = 10
BILLES = 1000


def bille(rangees):
    """Le numéro de la case où tombe une bille lâchée sur la planche.

    >>> 0 <= bille(10) <= 10
    True
    """
    case = 0
    for _ in range(rangees):
        if random() < 0.5:
            case = case + 1
    return case


def loi(n, k):
    """P(X = k) pour X de loi B(n ; 0,5).

    >>> loi(2, 1)
    0.5
    >>> loi(10, 0)
    0.0009765625
    """
    return comb(n, k) / 2**n


cases = [0] * (RANGEES + 1)
for _ in range(BILLES):
    cases[bille(RANGEES)] += 1

print(f"{BILLES} billes, {RANGEES} rangées de clous :")
for k, nombre in enumerate(cases):
    print(f"case {k:2} | {'█' * (nombre // 5)} {nombre}")

numeros = range(RANGEES + 1)
# Les numéros en texte : une étiquette sous chaque barre.
plt.bar([str(k) for k in numeros], [c / BILLES for c in cases], label="fréquences observées")
plt.plot(numeros, [loi(RANGEES, k) for k in numeros], "o-", color="C1", label="B(10 ; 0,5)")
plt.title(f"Planche de Galton : {BILLES} billes")
plt.xlabel("case")
plt.ylabel("fréquence")
plt.legend()
plt.show()
