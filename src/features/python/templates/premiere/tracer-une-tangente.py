# Modèle : Tracer une tangente
# Résumé : La courbe et sa tangente en a, avec matplotlib.

# f(x) = x³ − 3x + 1, donc f'(x) = 3x² − 3.
# La tangente au point d'abscisse a a pour équation y = f'(a)(x − a) + f(a).
import matplotlib.pyplot as plt


def f(x):
    """x³ − 3x + 1.

    >>> f(0), f(2)
    (1, 3)
    """
    return x**3 - 3 * x + 1


def derivee(x):
    """f'(x) = 3x² − 3.

    >>> derivee(0), derivee(1)
    (-3, 0)
    """
    return 3 * x**2 - 3


def tangente(a):
    """Le coefficient directeur m et l'ordonnée à l'origine p de la tangente en a : y = mx + p.

    >>> tangente(2)
    (9, -15)
    >>> tangente(1)
    (0, -1)
    """
    m = derivee(a)
    return m, f(a) - m * a


def equation(m, p):
    """L'équation y = mx + p, écrite comme au tableau.

    >>> equation(9, -15)
    'y = 9x − 15'
    >>> equation(0, -1)
    'y = −1'
    >>> equation(3.75, 7.75)
    'y = 3.75x + 7.75'
    """
    if m == 0:
        texte = f"y = {p:g}"
    elif p == 0:
        texte = f"y = {m:g}x"
    else:
        texte = f"y = {m:g}x {'+' if p > 0 else '-'} {abs(p):g}"
    return texte.replace("-", "−")


xs = [k / 50 for k in range(-125, 126)]
plt.plot(xs, [f(x) for x in xs], color="black", linewidth=3, label="y = f(x)")

for a in [-1.5, 1, 2]:
    m, p = tangente(a)
    print(f"Tangente au point d'abscisse {a:g} : {equation(m, p)}".replace("-", "−"))
    # La tangente, tracée de part et d'autre du point de contact.
    autour = [a - 1 + k / 50 for k in range(101)]
    plt.plot(autour, [m * x + p for x in autour], label=equation(m, p))
    plt.scatter([a], [f(a)])

plt.ylim(-4, 6)
plt.title("Courbe de f et trois tangentes")
plt.grid(True)
plt.legend()
plt.show()
