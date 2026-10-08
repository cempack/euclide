# Modèle : k plus proches voisins
# Résumé : Classer un point d'après ses voisins.

# Des iris de trois espèces, décrits par la longueur et la largeur de leurs
# pétales en cm (extrait du jeu de données de Fisher, 1936). Une nouvelle
# fleur reçoit l'espèce la plus fréquente parmi ses k plus proches voisines.
import math
from collections import Counter

import matplotlib.pyplot as plt

IRIS = [
    (1.4, 0.2, "setosa"),
    (1.3, 0.2, "setosa"),
    (1.5, 0.2, "setosa"),
    (1.7, 0.4, "setosa"),
    (1.4, 0.3, "setosa"),
    (1.5, 0.1, "setosa"),
    (1.1, 0.1, "setosa"),
    (1.6, 0.2, "setosa"),
    (4.7, 1.4, "versicolor"),
    (4.5, 1.5, "versicolor"),
    (4.9, 1.5, "versicolor"),
    (4.0, 1.3, "versicolor"),
    (4.6, 1.5, "versicolor"),
    (3.3, 1.0, "versicolor"),
    (4.7, 1.6, "versicolor"),
    (3.9, 1.4, "versicolor"),
    (6.0, 2.5, "virginica"),
    (5.1, 1.9, "virginica"),
    (5.9, 2.1, "virginica"),
    (5.6, 1.8, "virginica"),
    (5.8, 2.2, "virginica"),
    (6.6, 2.1, "virginica"),
    (4.5, 1.7, "virginica"),
    (6.1, 2.5, "virginica"),
]


def distance(p, q):
    """La distance entre les points p et q du plan.

    >>> distance((0, 0), (3, 4))
    5.0
    >>> distance((1, 2), (1, 2))
    0.0
    """
    return math.sqrt((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2)


def plus_proches(donnees, point, k):
    """Les k données les plus proches du point, de la plus proche à la plus lointaine.

    >>> [espece for _, _, espece in plus_proches(IRIS, (1.5, 0.3), 2)]
    ['setosa', 'setosa']
    >>> plus_proches(IRIS, (6.6, 2.1), 1)
    [(6.6, 2.1, 'virginica')]
    """
    return sorted(donnees, key=lambda donnee: distance(point, donnee[:2]))[:k]


def classer(donnees, point, k):
    """L'espèce la plus fréquente parmi les k plus proches voisines du point.
    En cas d'égalité, celle de la voisine la plus proche l'emporte.

    >>> classer(IRIS, (1.5, 0.3), 3)
    'setosa'
    >>> classer(IRIS, (6.0, 2.2), 3)
    'virginica'
    """
    voisines = plus_proches(donnees, point, k)
    return Counter(espece for _, _, espece in voisines).most_common(1)[0][0]


fleur = (4.6, 1.7)
print(f"Nouvelle fleur : pétales de {fleur[0]} cm sur {fleur[1]} cm")
for k in [1, 3, 5]:
    print(f"  avec k = {k} : {classer(IRIS, fleur, k)}")
print("Ses trois plus proches voisines :")
for x, y, espece in plus_proches(IRIS, fleur, 3):
    print(f"  {espece:<10} ({x} ; {y}) à {distance(fleur, (x, y)):.2f} cm")

for espece in ["setosa", "versicolor", "virginica"]:
    xs = [x for x, _, e in IRIS if e == espece]
    ys = [y for _, y, e in IRIS if e == espece]
    plt.scatter(xs, ys, label=espece)
plt.scatter([fleur[0]], [fleur[1]], s=200, marker="*", color="k", label="nouvelle fleur")
plt.xlabel("longueur des pétales (cm)")
plt.ylabel("largeur des pétales (cm)")
plt.title("Les k plus proches voisins")
plt.legend()
plt.show()
