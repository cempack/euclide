# Modèle : π par Monte-Carlo
# Résumé : Des points au hasard, ceux du quart de disque.

# On tire N points au hasard dans le carré [0 ; 1] × [0 ; 1]. La proportion de
# ceux qui tombent dans le quart de disque de rayon 1 est proche de son aire, π/4.
from random import random

import math

import matplotlib.pyplot as plt


def dans_le_quart_de_disque(x, y):
    """True si le point (x, y) est à une distance au plus 1 de l'origine.

    >>> dans_le_quart_de_disque(0.5, 0.5)
    True
    >>> dans_le_quart_de_disque(0.9, 0.9)
    False
    """
    return x**2 + y**2 <= 1


N = 2000
dedans_x, dedans_y, dehors_x, dehors_y = [], [], [], []
for _ in range(N):
    x, y = random(), random()
    if dans_le_quart_de_disque(x, y):
        dedans_x.append(x)
        dedans_y.append(y)
    else:
        dehors_x.append(x)
        dehors_y.append(y)

frequence = len(dedans_x) / N
print(f"{len(dedans_x)} points sur {N} sont dans le quart de disque.")
print(f"π ≈ 4 × {frequence:.4f} = {4 * frequence:.4f}")

angles = [k * math.pi / 200 for k in range(101)]
plt.figure(figsize=(6, 6))
plt.scatter(dedans_x, dedans_y, s=6, color="C0")
plt.scatter(dehors_x, dehors_y, s=6, color="C1")
plt.plot([math.cos(t) for t in angles], [math.sin(t) for t in angles], color="black", linewidth=3)
plt.xlim(0, 1)
plt.ylim(0, 1)
plt.title(f"{N} points, en bleu ceux du quart de disque : π ≈ {4 * frequence:.3f}")
plt.show()
