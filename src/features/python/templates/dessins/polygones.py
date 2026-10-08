# Modèle : Polygones avec turtle
# Résumé : Une fonction, une boucle, et les polygones réguliers.

# Des polygones réguliers de 3 à 10 côtés, posés sur le même côté.
# Pour un polygone à n côtés, on tourne de 360 / n degrés à chaque sommet.
from turtle import *


def polygone(n, cote):
    """Trace un polygone régulier à n côtés, en tournant vers la gauche."""
    for _ in range(n):
        forward(cote)
        left(360 / n)


couleurs = ["#0F4FA8", "#D63C46", "#2E7D32", "#C2410C", "#7C3AED", "#0E7C86", "#8A5300", "#111213"]
speed(0)
pensize(2)
penup()
goto(-40, -123)  # le côté commun, pour que la figure soit centrée
pendown()
for n in range(3, 11):
    color(couleurs[n - 3])
    polygone(n, 80)
hideturtle()
done()
