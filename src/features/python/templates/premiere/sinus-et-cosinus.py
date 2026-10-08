# Modèle : Sinus et cosinus
# Résumé : Les deux courbes sur [−2π ; 2π], en radians.

# Les fonctions sin et cos du module math travaillent en radians :
# un tour complet mesure 2π.
import math

import matplotlib.pyplot as plt

# Quelques valeurs remarquables.
angles = [("0", 0), ("π/6", math.pi / 6), ("π/4", math.pi / 4), ("π/3", math.pi / 3), ("π/2", math.pi / 2)]
for nom, x in angles:
    print(f"x = {nom:4}   cos x = {math.cos(x):.4f}   sin x = {math.sin(x):.4f}")
print("Pour tout x, cos² x + sin² x = 1. Avec x = 2 :", round(math.cos(2) ** 2 + math.sin(2) ** 2, 12))

xs = [k * math.pi / 50 for k in range(-100, 101)]
plt.figure(figsize=(8, 4))
plt.plot(xs, [math.sin(x) for x in xs], color="C0")
plt.plot(xs, [math.cos(x) for x in xs], color="C1")
plt.text(math.pi / 2 - 0.3, 1.12, "sin x", color="C0")
plt.text(-0.3, 1.12, "cos x", color="C1")
plt.axhline(0, color="gray")
for k, nom in [(-2, "−2π"), (-1, "−π"), (1, "π"), (2, "2π")]:
    plt.axvline(k * math.pi, color="gray", linestyle=":")
    plt.text(k * math.pi + 0.1, -1.3, nom)
plt.ylim(-1.4, 1.4)
plt.xlabel("x (en radians)")
plt.title("Fonctions sinus et cosinus sur [−2π ; 2π]")
plt.show()
