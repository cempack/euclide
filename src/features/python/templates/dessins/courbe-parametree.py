# Modèle : Courbe paramétrée
# Résumé : x(t) et y(t) : un cercle, une cardioïde, une spirale.

# Quand t varie, le point de coordonnées (x(t) ; y(t)) décrit une courbe.
from math import cos, pi, sin

import matplotlib.pyplot as plt

ts = [4 * pi * i / 800 for i in range(801)]  # t de 0 à 4π

# Le cercle de centre O et de rayon 2 : un seul tour suffit (t de 0 à 2π).
tour = [t for t in ts if t <= 2 * pi]
plt.plot([2 * cos(t) for t in tour], [2 * sin(t) for t in tour], label="cercle")

# La cardioïde : le rayon 1 + cos(t) varie avec l'angle t.
plt.plot([(1 + cos(t)) * cos(t) for t in tour], [(1 + cos(t)) * sin(t) for t in tour], label="cardioïde")

# La spirale d'Archimède : le rayon t / (2π) grandit avec l'angle, deux tours.
plt.plot([t / (2 * pi) * cos(t) for t in ts], [t / (2 * pi) * sin(t) for t in ts], label="spirale")

plt.axis("equal")
plt.grid(True)
plt.legend()
plt.title("Trois courbes paramétrées")
plt.show()
