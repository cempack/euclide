# Modèle : Moyennes d'échantillons
# Résumé : Plus l'échantillon est grand, plus sa moyenne approche l'espérance.

# X est le résultat d'un lancer de dé : son espérance vaut 3,5.
# On simule 100 échantillons de taille n, pour n = 10, 100 et 1000,
# et on regarde l'écart entre la moyenne de chaque échantillon et 3,5.
from random import randint

import matplotlib.pyplot as plt


def moyenne_echantillon(n):
    """La moyenne de n lancers d'un dé.

    >>> 1 <= moyenne_echantillon(10) <= 6
    True
    """
    total = 0
    for _ in range(n):
        total = total + randint(1, 6)
    return total / n


plt.axhline(3.5, color="gray", linestyle="--")
for n in [10, 100, 1000]:
    moyennes = [moyenne_echantillon(n) for _ in range(100)]
    ecart_max = max(abs(m - 3.5) for m in moyennes)
    proches = sum(1 for m in moyennes if abs(m - 3.5) <= 0.1)
    print(
        f"n = {n:4} : moyennes entre {min(moyennes):.2f} et {max(moyennes):.2f}, "
        f"écart maximal {ecart_max:.2f}, {proches} sur 100 à moins de 0,1 de 3,5"
    )
    plt.scatter(list(range(1, 101)), moyennes, s=12, label=f"n = {n}")

plt.xlabel("échantillon")
plt.ylabel("moyenne")
plt.title("Moyennes de 100 échantillons de n lancers de dé")
plt.legend()
plt.show()
