# Modèle : Méthode de Newton
# Résumé : Approcher une racine en suivant les tangentes.

# f(x) = x² − 2 s'annule en √2. Depuis x_0 = 3, on remplace x par l'abscisse
# du point où la tangente en x coupe l'axe des abscisses : x − f(x) / f'(x).
import math

import matplotlib.pyplot as plt


def f(x):
    """x² − 2.

    >>> f(2)
    2
    """
    return x**2 - 2


def derivee(x):
    """f'(x) = 2x.

    >>> derivee(3)
    6
    """
    return 2 * x


def newton(x, etapes):
    """L'approximation obtenue depuis x après le nombre d'étapes demandé.

    >>> round(newton(3, 1), 4)
    1.8333
    >>> abs(newton(3, 6) - math.sqrt(2)) < 1e-12
    True
    """
    for _ in range(etapes):
        x = x - f(x) / derivee(x)
    return x


x = 3
print(f"x_0 = {x}")
for n in range(1, 7):
    x = newton(x, 1)
    print(f"x_{n} = {x:.15f}   écart avec √2 : {abs(x - math.sqrt(2)):.1e}")
print("Le nombre de décimales exactes double à peu près à chaque étape.")

abscisses = [k / 50 for k in range(0, 166)]
plt.plot(abscisses, [f(t) for t in abscisses], color="black", linewidth=3, label="y = x² − 2")
plt.axhline(0, color="gray")
x = 3
for n in range(3):
    suivant = newton(x, 1)
    plt.plot([x, x], [0, f(x)], color="gray", linestyle=":")
    plt.plot([x, suivant], [f(x), 0], color="red")
    plt.text(x, -0.8, f"x_{n}")
    x = suivant
plt.ylim(-2, 8)
plt.title("Méthode de Newton : chaque tangente rapproche de √2")
plt.grid(True)
plt.legend()
plt.show()
