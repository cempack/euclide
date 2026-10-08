# Modèle : Flocon de Koch
# Résumé : Une fractale, tracée par une fonction récursive.

# Au niveau suivant, chaque segment devient quatre segments trois fois plus courts,
# avec une pointe vers l'extérieur.
from turtle import *

NIVEAU = 4
COTE = 360


def koch(longueur, niveau):
    """Trace une courbe de Koch : un segment au niveau 0, quatre courbes plus petites sinon."""
    if niveau == 0:
        forward(longueur)
    else:
        koch(longueur / 3, niveau - 1)
        left(60)
        koch(longueur / 3, niveau - 1)
        right(120)
        koch(longueur / 3, niveau - 1)
        left(60)
        koch(longueur / 3, niveau - 1)


speed(0)
pensize(2)
color("#0F4FA8", "#DCE8FB")
penup()
goto(-COTE / 2, COTE * 3**0.5 / 6)  # le centre du triangle de départ à l'origine
pendown()
begin_fill()
for _ in range(3):
    koch(COTE, NIVEAU)
    right(120)
end_fill()
hideturtle()

print(f"Niveau {NIVEAU} : {3 * 4**NIVEAU} segments de longueur {COTE / 3**NIVEAU:.2f}")
print(f"Périmètre : {3 * COTE * (4 / 3) ** NIVEAU:.0f}, multiplié par 4/3 à chaque niveau")
done()
