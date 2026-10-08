# Modèle : Marche aléatoire
# Résumé : Un pas à gauche ou à droite : la trajectoire.

# Un marcheur part de 0. À chaque seconde, il fait un pas à droite (+1) ou à
# gauche (−1), avec la même probabilité. Où est-il après 200 pas ?
from random import choice

import matplotlib.pyplot as plt


def marche(nombre_de_pas):
    """La liste des positions successives du marcheur, en partant de 0.

    >>> positions = marche(10)
    >>> len(positions), positions[0]
    (11, 0)
    >>> marche(10)[-1] % 2  # après un nombre pair de pas, la position est paire
    0
    """
    positions = [0]
    for _ in range(nombre_de_pas):
        positions.append(positions[-1] + choice([-1, 1]))
    return positions


N = 200
positions = marche(N)
print("Position finale :", positions[-1])
print("Plus grand éloignement :", max(abs(p) for p in positions))
print("Retours à l'origine :", positions[1:].count(0))

# Sur 500 marches : les positions finales se compensent en moyenne,
# mais leur carré vaut en moyenne le nombre de pas.
finales = [marche(N)[-1] for _ in range(500)]
print()
print("Sur 500 marches de", N, "pas :")
print("moyenne des positions finales :", round(sum(finales) / len(finales), 2))
print("moyenne de leurs carrés       :", round(sum(p**2 for p in finales) / len(finales), 1))

for _ in range(5):
    plt.plot(list(range(N + 1)), marche(N))
plt.axhline(0, color="gray")
plt.xlabel("nombre de pas")
plt.ylabel("position")
plt.title(f"Cinq marches aléatoires de {N} pas")
plt.grid(True)
plt.show()
