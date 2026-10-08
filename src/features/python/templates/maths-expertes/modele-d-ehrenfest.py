# Modèle : Modèle d'Ehrenfest
# Résumé : Deux urnes, des particules qui changent de côté.

# N particules, toutes dans l'urne A au départ. À chaque étape, on tire une
# particule au hasard et on la change d'urne. X_k est le nombre de particules dans A.
# En moyenne, E(X_k) = N/2 + (N/2)(1 − 2/N)^k : on tend vers l'équilibre N/2.
from random import randint
import matplotlib.pyplot as plt

N = 50
ETAPES = 400


def etape(x, n):
    """Le nombre de particules dans A après une étape, s'il y en avait x sur n.

    >>> etape(0, 10)
    1
    >>> etape(10, 10)
    9
    """
    if randint(1, n) <= x:  # la particule tirée était dans A
        return x - 1
    return x + 1


def moyenne_theorique(n, k):
    """E(X_k) quand les n particules sont dans A au départ.

    >>> moyenne_theorique(50, 0)
    50.0
    >>> round(moyenne_theorique(50, 1000), 6)
    25.0
    """
    return n / 2 + n / 2 * (1 - 2 / n) ** k


x = N
simulation = [x]
for _ in range(ETAPES):
    x = etape(x, N)
    simulation.append(x)

seconde_moitie = simulation[ETAPES // 2 :]
print(f"Après {ETAPES} étapes : {simulation[-1]} particules dans A.")
moyenne = sum(seconde_moitie) / len(seconde_moitie)
print(f"Moyenne sur la seconde moitié : {moyenne:.1f} (équilibre : {N / 2:g})")

plt.plot(range(ETAPES + 1), simulation, label="simulation")
moyennes = [moyenne_theorique(N, k) for k in range(ETAPES + 1)]
plt.plot(range(ETAPES + 1), moyennes, "--", label="moyenne théorique")
plt.axhline(N / 2, color="gray")
plt.xlabel("étape k")
plt.ylabel("particules dans l'urne A")
plt.title(f"Modèle d'Ehrenfest, {N} particules")
plt.legend()
plt.show()
