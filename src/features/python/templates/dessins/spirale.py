# Modèle : Spirale
# Résumé : Avancer un peu plus à chaque tour.

# À chaque segment, on avance un peu plus loin, puis on tourne de 59°.
# Avec 60°, on tracerait des hexagones ; avec 59°, la spirale se tord.
from turtle import *

couleurs = ["#0F4FA8", "#7C3AED", "#D63C46", "#C2410C", "#2E7D32", "#0E7C86"]
speed(10)
longueur = 2
for i in range(100):
    color(couleurs[i % 6])
    pensize(1 + i / 40)  # le trait s'épaissit aussi
    forward(longueur)
    left(59)
    longueur = longueur + 2.2
hideturtle()
done()
