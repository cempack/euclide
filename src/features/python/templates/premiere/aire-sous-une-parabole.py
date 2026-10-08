# Modèle : Aire sous une parabole
# Résumé : L'aire sous y = x² entre 0 et 1, par Monte-Carlo.

# On tire des points au hasard dans le carré [0 ; 1] × [0 ; 1], d'aire 1 :
# la proportion de ceux qui tombent sous la parabole y = x² approche l'aire cherchée.
from random import random

import matplotlib.pyplot as plt


def sous_la_courbe(x, y):
    """True si le point (x, y) est sous la parabole y = x².

    >>> sous_la_courbe(0.5, 0.2)
    True
    >>> sous_la_courbe(0.5, 0.3)
    False
    """
    return y <= x**2


for N in [100, 1000, 10000, 100000]:
    dessous = 0
    for _ in range(N):
        if sous_la_courbe(random(), random()):
            dessous = dessous + 1
    print(f"N = {N:6} : aire ≈ {dessous / N:.4f}")
print("Valeur exacte : 1/3 ≈ 0.3333")

points = [(random(), random()) for _ in range(1500)]
dessous = [p for p in points if sous_la_courbe(p[0], p[1])]
dessus = [p for p in points if not sous_la_courbe(p[0], p[1])]
abscisses = [k / 100 for k in range(101)]

plt.figure(figsize=(6, 6))
plt.scatter([p[0] for p in dessous], [p[1] for p in dessous], s=6, color="C0")
plt.scatter([p[0] for p in dessus], [p[1] for p in dessus], s=6, color="C1")
plt.plot(abscisses, [x**2 for x in abscisses], color="black", linewidth=3)
plt.xlim(0, 1)
plt.ylim(0, 1)
plt.title(f"Points sous la courbe, en bleu : {len(dessous) / len(points):.1%}")
plt.show()
