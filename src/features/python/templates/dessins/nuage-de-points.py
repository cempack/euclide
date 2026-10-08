# Modèle : Nuage de points
# Résumé : Une série double et sa droite d'ajustement.

# Heures de révision et note au contrôle : la droite des moindres carrés,
# qui passe par le point moyen G.
from statistics import correlation, linear_regression, mean

import matplotlib.pyplot as plt

heures = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6]
notes = [6, 8, 7.5, 10, 11, 10.5, 13, 14, 15.5, 17]

a, b = linear_regression(heures, notes)
r = correlation(heures, notes)
xg, yg = mean(heures), mean(notes)
print(f"Droite d'ajustement : y = {a:.2f}x + {b:.2f}")
print(f"Coefficient de corrélation : r = {r:.3f}")
print(f"Point moyen : G({xg:.2f} ; {yg:.2f})")
print(f"Estimation pour 4,5 h de révision : {a * 4.5 + b:.1f} / 20")

plt.scatter(heures, notes)
plt.plot([0, 6.5], [b, a * 6.5 + b], color="red")
plt.scatter([xg], [yg], color="green", marker="s")
plt.text(xg - 0.2, yg + 0.6, "G")
plt.text(4.3, a * 4.3 + b - 1.6, f"y = {a:.2f}x + {b:.2f}")
plt.xlim(0, 6.5)
plt.ylim(0, 20)
plt.xlabel("Heures de révision")
plt.ylabel("Note sur 20")
plt.title("Révisions et résultats")
plt.grid(True)
plt.show()
