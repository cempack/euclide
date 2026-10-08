# Modèle : Construire exp par Euler
# Résumé : f' = f et f(0) = 1, pas à pas.

# On cherche f telle que f' = f et f(0) = 1. Pour un petit pas h,
# f(x + h) ≈ f(x) + h × f'(x) = (1 + h) × f(x) : on avance de proche en proche.
import math

import matplotlib.pyplot as plt


def euler(h, x_max):
    """Les abscisses et les valeurs approchées de f, de 0 à x_max, avec le pas h.

    >>> euler(0.5, 1)
    ([0.0, 0.5, 1.0], [1, 1.5, 2.25])
    """
    n = round(x_max / h)
    xs = [k * h for k in range(n + 1)]
    ys = [1]
    for _ in range(n):
        ys.append(ys[-1] * (1 + h))
    return xs, ys


for h in [0.5, 0.1, 0.01, 0.001]:
    xs, ys = euler(h, 1)
    print(f"pas h = {h:<5} : f(1) ≈ {ys[-1]:.6f}")
print(f"Valeur exacte : e = exp(1) = {math.e:.6f}")

for h in [0.5, 0.2, 0.05]:
    xs, ys = euler(h, 2)
    plt.plot(xs, ys, marker=".", label=f"Euler, h = {h}")
abscisses = [k / 50 for k in range(101)]
plt.plot(abscisses, [math.exp(x) for x in abscisses], color="black", linewidth=3, label="exp")
plt.ylim(0, 10)
plt.xlabel("x")
plt.title("Plus le pas est petit, plus on se rapproche de exp")
plt.grid(True)
plt.legend()
plt.show()
