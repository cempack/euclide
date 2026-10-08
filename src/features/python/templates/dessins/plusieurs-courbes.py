# Modèle : Plusieurs courbes
# Résumé : Comparer des fonctions sur un même repère, avec une légende.

# x, x², x³ et √x : laquelle est au-dessus des autres, avant et après 1 ?
from math import sqrt

import matplotlib.pyplot as plt

for x in [0.5, 1, 1.5]:
    print(f"x = {x} : x³ = {x**3:.3f}  x² = {x**2:.3f}  √x = {sqrt(x):.3f}")

xs = [i / 100 for i in range(201)]  # de 0 à 2, par pas de 0,01
plt.plot(xs, [sqrt(x) for x in xs], label="y = √x")
plt.plot(xs, xs, label="y = x")
plt.plot(xs, [x**2 for x in xs], label="y = x²")
plt.plot(xs, [x**3 for x in xs], label="y = x³")
plt.axvline(1, color="gray", linestyle="--")
plt.ylim(0, 3)
plt.grid(True)
plt.legend()
plt.xlabel("x")
plt.title("Positions relatives de √x, x, x² et x³")
plt.show()
