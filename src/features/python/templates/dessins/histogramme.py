# Modèle : Histogramme
# Résumé : Une série regroupée en classes.

# La taille (en cm) de 200 élèves, simulée, regroupée en classes de 5 cm.
from random import gauss
from statistics import mean, stdev

import matplotlib.pyplot as plt

tailles = [round(gauss(170, 8)) for _ in range(200)]
print(f"Moyenne : {mean(tailles):.1f} cm   écart type : {stdev(tailles):.1f} cm")

# Des classes [a ; a + 5[ qui couvrent toutes les tailles.
debut = min(tailles) // 5 * 5
fin = max(tailles) // 5 * 5 + 5
classes = list(range(debut, fin + 1, 5))
for a in classes[:-1]:
    effectif = len([t for t in tailles if a <= t < a + 5])
    print(f"[{a} ; {a + 5}[ : {effectif:>3}")

plt.hist(tailles, bins=classes, color="#0F4FA8", edgecolor="white")
plt.xlabel("Taille (cm)")
plt.ylabel("Effectif")
plt.title("Taille de 200 élèves")
plt.show()
