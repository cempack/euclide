# Modèle : Rosace
# Résumé : 36 cercles tournés de 10°, en trois couleurs.

# Une rosace : 36 cercles, chacun tourné de 10°.
from turtle import *

couleurs = ["#0F4FA8", "#D63C46", "#2E7D32"]
speed(0)
for i in range(36):
    color(couleurs[i % 3])
    circle(80)
    left(10)
hideturtle()
done()
