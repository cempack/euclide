# Modèle : Longueur d'une courbe
# Résumé : Approcher la courbe par des segments de plus en plus courts.

# On découpe [a ; b] en n morceaux de même largeur et on relie les points de la courbe
# par des segments : la longueur de cette ligne brisée approche celle de la courbe.
from math import pi, sqrt


def f(x):
    return x**2


def demi_cercle(x):
    # Le demi-cercle de centre O et de rayon 1 : y = √(1 − x²), sur [−1 ; 1].
    return sqrt(max(0, 1 - x**2))


def longueur(fonction, a, b, n):
    """Renvoie la longueur de la ligne brisée à n segments qui suit la courbe sur [a ; b].

    >>> longueur(f, 0, 1, 1)
    1.4142135623730951
    >>> round(longueur(f, 0, 1, 1000), 4)
    1.4789
    """
    pas = (b - a) / n
    total = 0
    for k in range(n):
        x1 = a + k * pas
        x2 = a + (k + 1) * pas
        total = total + sqrt((x2 - x1) ** 2 + (fonction(x2) - fonction(x1)) ** 2)
    return total


print("Courbe de f(x) = x² sur [0 ; 1] :")
for n in [1, 2, 5, 10, 100, 1000]:
    print(f"  {n:>4} segments : longueur ≈ {longueur(f, 0, 1, n):.6f}")

print()
print("Demi-cercle de rayon 1 : sa longueur est π.")
for n in [10, 100, 1000]:
    print(f"  {n:>4} segments : longueur ≈ {longueur(demi_cercle, -1, 1, n):.6f}")
print(f"  π = {pi:.6f}")
