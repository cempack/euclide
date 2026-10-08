# Modèle : Escalier d'une suite
# Résumé : u_(n+1) = f(u_n) : la courbe, la droite y = x, l'escalier.

# u_0 = 0 et u_(n+1) = f(u_n) avec f(x) = √(3x + 4).
# On construit les termes sur l'axe des abscisses, en rebondissant entre
# la courbe de f et la droite y = x : ils montent vers 4, où les deux se coupent.
import math

import matplotlib.pyplot as plt


def f(x):
    """√(3x + 4).

    >>> f(0)
    2.0
    >>> f(4)
    4.0
    """
    return math.sqrt(3 * x + 4)


u = 0
N = 8
print(f"u_0 = {u}")

# De (u_n, u_n), on monte jusqu'à la courbe en (u_n, u_(n+1)),
# puis on rejoint la droite y = x en (u_(n+1), u_(n+1)).
xs, ys = [u], [0]
for n in range(1, N + 1):
    suivant = f(u)
    xs += [u, suivant]
    ys += [suivant, suivant]
    print(f"u_{n} = {suivant:.4f}")
    u = suivant

abscisses = [k / 20 for k in range(121)]
plt.figure(figsize=(6, 5))
plt.plot(abscisses, [f(x) for x in abscisses], label="y = f(x)")
plt.plot([0, 6], [0, 6], label="y = x")
plt.plot(xs, ys, color="red", label="escalier")
plt.xlim(0, 6)
plt.ylim(0, 6)
plt.axis("equal")
plt.title("u_(n+1) = f(u_n)")
plt.grid(True)
plt.legend()
plt.show()

# Avec f(x) = 3 − 0,5x, l'escalier devient un escargot : essayez !
