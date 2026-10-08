# Modèle : Euler pour y' = f(x)
# Résumé : Approcher une primitive, pas à pas.
# Script : Euler primitive

# Résoudre y' = f(x) avec y(x_0) = y_0, c'est chercher une primitive de f.
# Méthode d'Euler : on avance par petits pas h en suivant la pente f(x),
# y(x + h) ≈ y(x) + h × f(x). Ici f(x) = 1/x et y(1) = 0 : on construit ln.
from math import log

import matplotlib.pyplot as plt


def f(x):
    return 1 / x


def euler(f, x0, y0, h, n):
    """Les listes des x et des y obtenus après n pas de longueur h.

    >>> euler(lambda x: 2 * x, 0, 0, 1, 3)
    ([0, 1, 2, 3], [0, 0, 2, 6])
    >>> xs, ys = euler(lambda x: 1, 0, 5, 0.5, 4)
    >>> ys
    [5, 5.5, 6.0, 6.5, 7.0]
    """
    xs, ys = [x0], [y0]
    for _ in range(n):
        ys.append(ys[-1] + h * f(xs[-1]))
        xs.append(xs[-1] + h)
    return xs, ys


print(f"ln 5 = {log(5):.5f}")
for h in (0.5, 0.1, 0.01):
    xs, ys = euler(f, 1, 0, h, round(4 / h))
    print(f"h = {h:<4} : y(5) ≈ {ys[-1]:.5f}")
    plt.plot(xs, ys, label=f"Euler, h = {h}")

xs = [1 + k / 100 for k in range(401)]
plt.plot(xs, [log(x) for x in xs], "k--", label="ln(x)")
plt.title("Méthode d'Euler pour y' = 1/x, y(1) = 0")
plt.xlabel("x")
plt.ylabel("y")
plt.ylim(0, 2.5)
plt.grid(True)
plt.legend()
plt.show()
