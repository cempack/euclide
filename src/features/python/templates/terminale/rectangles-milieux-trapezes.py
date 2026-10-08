# Modèle : Rectangles, milieux, trapèzes
# Résumé : Trois méthodes pour une intégrale, comparées.
# Script : Rectangles milieux trapèzes

# Approcher l'intégrale de eˣ entre 0 et 1, qui vaut e − 1, en découpant
# [0 ; 1] en n bandes de largeur h = 1/n.
from math import exp


def f(x):
    return exp(x)


def rectangles(f, a, b, n):
    """La somme des aires des n rectangles dont la hauteur est prise à gauche.

    >>> rectangles(lambda x: x, 0, 1, 4)
    0.375
    """
    h = (b - a) / n
    return h * sum(f(a + k * h) for k in range(n))


def milieux(f, a, b, n):
    """La somme des aires des n rectangles dont la hauteur est prise au milieu.

    >>> milieux(lambda x: x, 0, 1, 4)
    0.5
    """
    h = (b - a) / n
    return h * sum(f(a + (k + 0.5) * h) for k in range(n))


def trapezes(f, a, b, n):
    """La somme des aires des n trapèzes.

    >>> trapezes(lambda x: x, 0, 1, 4)
    0.5
    >>> trapezes(lambda x: x * x, 0, 1, 2)
    0.375
    """
    h = (b - a) / n
    return h * (f(a) / 2 + sum(f(a + k * h) for k in range(1, n)) + f(b) / 2)


valeur = exp(1) - 1
print(f"Intégrale de eˣ entre 0 et 1 : e − 1 = {valeur:.10f}")
print()
print("     n    rectangles     milieux     trapèzes   (écarts à e − 1)")
for n in (10, 100, 1000):
    ecarts = [
        abs(rectangles(f, 0, 1, n) - valeur),
        abs(milieux(f, 0, 1, n) - valeur),
        abs(trapezes(f, 0, 1, n) - valeur),
    ]
    print(f"{n:6}" + "".join(f"{e:13.2e}" for e in ecarts))
print()
print("Quand n est multiplié par 10, l'écart des rectangles est divisé par 10,")
print("ceux des milieux et des trapèzes par 100.")
