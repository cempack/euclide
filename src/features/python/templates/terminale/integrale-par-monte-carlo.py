# Modèle : Intégrale par Monte-Carlo
# Résumé : La part des points sous la courbe.

# f(x) = e^(−x²) prend ses valeurs dans [0 ; 1] sur [0 ; 1]. On tire des points
# au hasard dans le carré [0 ; 1] × [0 ; 1] : la proportion de ceux qui sont
# sous la courbe approche l'intégrale de f entre 0 et 1 (l'aire du carré vaut 1).
# Cette intégrale n'a pas de primitive usuelle ; math.erf en donne la valeur.
from math import erf, exp, pi, sqrt
from random import random

import matplotlib.pyplot as plt


def f(x):
    return exp(-x * x)


def monte_carlo(f, n):
    """La proportion de n points tirés au hasard dans le carré unité qui sont
    sous la courbe de f.

    >>> monte_carlo(lambda x: 1, 100)
    1.0
    >>> monte_carlo(lambda x: 0, 100)
    0.0
    """
    sous = 0
    for _ in range(n):
        x, y = random(), random()
        if y < f(x):
            sous = sous + 1
    return sous / n


valeur = sqrt(pi) / 2 * erf(1)
print(f"Valeur de l'intégrale : {valeur:.6f}")
for n in (100, 1000, 10_000, 100_000):
    p = monte_carlo(f, n)
    print(f"n = {n:6} : {p:.4f}   écart {abs(p - valeur):.4f}   (de l'ordre de 1/√n = {1 / sqrt(n):.4f})")

points = [(random(), random()) for _ in range(1500)]
sous = [(x, y) for x, y in points if y < f(x)]
dessus = [(x, y) for x, y in points if y >= f(x)]
plt.scatter([x for x, y in sous], [y for x, y in sous], s=6, color="C0", label="sous la courbe")
plt.scatter([x for x, y in dessus], [y for x, y in dessus], s=6, color="C1", label="au-dessus")
xs = [k / 100 for k in range(101)]
plt.plot(xs, [f(x) for x in xs], "k", linewidth=2.5, label="y = e^(−x²)")
plt.title(f"{len(points)} points, dont {100 * len(sous) / len(points):.1f} % sous la courbe")
plt.xlim(0, 1.5)
plt.ylim(0, 1)
plt.legend()
plt.show()
