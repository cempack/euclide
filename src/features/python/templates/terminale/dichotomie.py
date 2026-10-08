# Modèle : Dichotomie
# Résumé : Encadrer une solution de f(x) = 0 à la précision voulue.

# f est continue et change de signe entre a et b : f(x) = 0 y a une solution.
# On coupe l'intervalle en deux et on garde la moitié où f change de signe ;
# à chaque étape, l'amplitude de l'encadrement est divisée par 2.
from math import sqrt


def f(x):
    return x**2 - 2


def dichotomie(a, b, precision):
    """Un encadrement [a, b] de la solution, d'amplitude au plus precision.

    >>> a, b = dichotomie(1, 2, 0.01)
    >>> a <= 2 ** 0.5 <= b and b - a <= 0.01
    True
    >>> dichotomie(0, 4, 1)
    (1.0, 2.0)
    """
    while b - a > precision:
        m = (a + b) / 2
        if f(a) * f(m) <= 0:
            b = m
        else:
            a = m
    return a, b


print("Solution de x² − 2 = 0 entre 1 et 2 :")
for precision in (0.1, 0.01, 0.001, 0.000001):
    a, b = dichotomie(1, 2, precision)
    print(f"   à {precision:g} près : {a} ≤ x ≤ {b}")
print(f"Et √2 = {sqrt(2)}")
