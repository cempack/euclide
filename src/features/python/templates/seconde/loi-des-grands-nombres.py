# Modèle : Loi des grands nombres
# Résumé : La fréquence de pile se stabilise autour de 0,5.

# On lance une pièce équilibrée 2 000 fois et on suit la fréquence de pile
# après chaque lancer : elle varie beaucoup au début, puis se stabilise.
from random import randint
import matplotlib.pyplot as plt


def lancer():
    """Renvoie 1 pour pile, 0 pour face, au hasard.

    >>> lancer() in (0, 1)
    True
    """
    return randint(0, 1)


N = 2000
piles = 0
frequences = []
for n in range(1, N + 1):
    piles = piles + lancer()
    frequences.append(piles / n)

for n in [10, 100, 1000, 2000]:
    print(f"Après {n:>4} lancers : fréquence de pile {frequences[n - 1]:.3f}")

plt.plot(range(1, N + 1), frequences, label="fréquence de pile")
plt.axhline(0.5, color="red", linestyle="--")
plt.ylim(0, 1)
plt.xlabel("Nombre de lancers")
plt.ylabel("Fréquence de pile")
plt.title(f"{N} lancers d'une pièce équilibrée")
plt.legend()
plt.show()
