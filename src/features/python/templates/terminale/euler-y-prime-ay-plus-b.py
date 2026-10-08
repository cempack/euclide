# Modèle : Euler pour y' = ay + b
# Résumé : La solution approchée et la solution exacte.
# Script : Euler ay plus b

# Un café à 80 °C refroidit dans une pièce à 20 °C : y' = −0,2 y + 4 (t en min).
# Méthode d'Euler : y(t + h) ≈ y(t) + h × (a y(t) + b).
# Solution exacte : y(t) = (y_0 + b/a) e^(at) − b/a.
from math import exp

import matplotlib.pyplot as plt

a, b = -0.2, 4
y0 = 80


def euler(a, b, y0, h, n):
    """Les valeurs approchées de y en 0, h, 2h, …, nh.

    >>> euler(1, 0, 1, 0.5, 2)
    [1, 1.5, 2.25]
    >>> euler(-1, 2, 2, 0.1, 3)
    [2, 2.0, 2.0, 2.0]
    """
    ys = [y0]
    for _ in range(n):
        ys.append(ys[-1] + h * (a * ys[-1] + b))
    return ys


def exacte(a, b, y0, t):
    """La valeur en t de la solution exacte.

    >>> exacte(1, 0, 1, 0)
    1.0
    >>> round(exacte(-0.2, 4, 80, 5), 4)
    42.0728
    """
    return (y0 + b / a) * exp(a * t) - b / a


h = 1
approchees = euler(a, b, y0, h, 30)
print("  t    Euler (h = 1)   exacte")
for t in range(0, 31, 5):
    print(f"{t:3}      {approchees[t]:6.2f}      {exacte(a, b, y0, t):6.2f}")
print(f"La température tend vers −b/a = {-b / a:g} °C, celle de la pièce.")

for h in (3, 1):
    ys = euler(a, b, y0, h, 30 // h)
    plt.plot([k * h for k in range(len(ys))], ys, "o-", label=f"Euler, h = {h}")
ts = [t / 10 for t in range(301)]
plt.plot(ts, [exacte(a, b, y0, t) for t in ts], "k", label="solution exacte")
plt.axhline(-b / a, color="gray", linestyle="--")
plt.title("Refroidissement : y' = −0,2 y + 4, y(0) = 80")
plt.xlabel("t (min)")
plt.ylabel("température (°C)")
plt.grid(True)
plt.legend()
plt.show()
