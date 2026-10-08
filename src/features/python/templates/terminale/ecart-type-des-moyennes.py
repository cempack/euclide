# Modèle : Écart type des moyennes
# Résumé : N échantillons de taille n : l'écart type est σ/√n.

# X : le résultat d'un lancer de dé, d'espérance μ = 3,5 et d'écart type
# σ = √(35/12). On tire N = 1000 échantillons de n lancers et on calcule leurs
# moyennes : elles se resserrent autour de μ, avec un écart type proche de σ/√n.
from math import sqrt
from random import randint

import matplotlib.pyplot as plt

N = 1000
sigma = sqrt(35 / 12)


def moyenne_echantillon(n):
    """La moyenne de n lancers d'un dé.

    >>> 1 <= moyenne_echantillon(10) <= 6
    True
    """
    return sum(randint(1, 6) for _ in range(n)) / n


def ecart_type(valeurs):
    """L'écart type de la série de valeurs.

    >>> ecart_type([2, 4, 4, 4, 5, 5, 7, 9])
    2.0
    >>> ecart_type([3, 3, 3])
    0.0
    """
    m = sum(valeurs) / len(valeurs)
    return sqrt(sum((v - m) ** 2 for v in valeurs) / len(valeurs))


print("taille n   écart type des moyennes   σ/√n")
for n in (1, 4, 25, 100):
    moyennes = [moyenne_echantillon(n) for _ in range(N)]
    print(f"{n:6}            {ecart_type(moyennes):.4f}            {sigma / sqrt(n):.4f}")
print("Quatre fois plus de lancers : un écart type deux fois plus petit.")

plt.hist(moyennes, bins=20, edgecolor="white")
plt.axvline(3.5, color="C1", linestyle="--")
plt.title(f"{N} moyennes d'échantillons de {n} lancers")
plt.xlabel("moyenne de l'échantillon")
plt.ylabel("effectif")
plt.show()
