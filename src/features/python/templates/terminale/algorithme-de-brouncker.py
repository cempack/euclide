# Modèle : Algorithme de Brouncker
# Résumé : ln 2 comme une somme d'aires de rectangles.

# ln 2 est l'aire sous l'hyperbole y = 1/x entre 1 et 2. Brouncker (1668) la
# remplit de rectangles : un premier, d'aire 1/(1×2), puis à chaque étape un
# rectangle de plus dans chaque creux, d'aires 1/(3×4), 1/(5×6), 1/(7×8)…
# ln 2 = 1/(1×2) + 1/(3×4) + 1/(5×6) + …
from fractions import Fraction
from math import log

import matplotlib.pyplot as plt


def f(x):
    return 1 / x


def brouncker(n):
    """La somme 1/(1×2) + 1/(3×4) + … + 1/((2n − 1) × 2n).

    >>> brouncker(1)
    0.5
    >>> round(brouncker(2), 6)
    0.583333
    >>> round(brouncker(1000), 3)
    0.693
    """
    return sum(1 / ((2 * k - 1) * (2 * k)) for k in range(1, n + 1))


def brouncker_exact(n):
    """La même somme, en fraction exacte.

    >>> brouncker_exact(2)
    Fraction(7, 12)
    """
    return sum(Fraction(1, (2 * k - 1) * (2 * k)) for k in range(1, n + 1))


def rectangles_ajoutes(etape):
    """Les rectangles (x_gauche, x_droite, y_bas, y_haut) ajoutés à cette étape.

    >>> rectangles_ajoutes(0)
    [(1, 2, 0, 0.5)]
    >>> rectangles_ajoutes(1)
    [(1.0, 1.5, 0.5, 0.6666666666666666)]
    """
    if etape == 0:
        return [(1, 2, 0, f(2))]
    largeur = 1 / 2 ** (etape - 1)
    ajoutes = []
    for i in range(2 ** (etape - 1)):
        x = 1 + i * largeur
        # Sur la moitié gauche de chaque marche, on monte jusqu'à la courbe.
        ajoutes.append((x, x + largeur / 2, f(x + largeur), f(x + largeur / 2)))
    return ajoutes


print(f"ln 2 = {log(2):.10f}")
print(f"Après 2 termes : {brouncker_exact(2)}, après 4 : {brouncker_exact(4)}")
print("À chaque étape, le nombre de rectangles double :")
for etape in range(11):
    n = 2**etape
    s = brouncker(n)
    print(f"étape {etape:2} : S_{n:<4} = {s:.10f}   écart {log(2) - s:.1e}")

for etape in range(4):
    for i, (x0, x1, y0, y1) in enumerate(rectangles_ajoutes(etape)):
        plt.plot(
            [x0, x0, x1, x1, x0],
            [y0, y1, y1, y0, y0],
            color=f"C{etape + 1}",
            label=f"étape {etape}" if i == 0 else None,
        )
xs = [1 + k / 100 for k in range(101)]
plt.plot(xs, [f(x) for x in xs], "k", linewidth=2.5, label="y = 1/x")
plt.title("Les rectangles de Brouncker sous l'hyperbole")
plt.ylim(0, 1.1)
plt.legend()
plt.show()
