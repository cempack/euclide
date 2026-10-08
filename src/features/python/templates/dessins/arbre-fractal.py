# Modèle : Arbre fractal
# Résumé : Chaque branche porte deux branches plus petites.

# Une branche, puis deux branches 0,7 fois plus courtes, à 25° de part et d'autre,
# et ainsi de suite : la fonction s'appelle elle-même.
from turtle import *


def arbre(longueur, niveau):
    """Trace une branche et toutes ses sous-branches, puis revient à son pied."""
    if niveau == 0:
        return
    pensize(niveau)
    color("#8A5300" if niveau > 4 else "#2E7D32")
    forward(longueur)
    left(25)
    arbre(longueur * 0.7, niveau - 1)
    right(50)
    arbre(longueur * 0.7, niveau - 1)
    left(25)
    penup()
    backward(longueur)
    pendown()


speed(0)
penup()
goto(0, -185)
setheading(90)  # vers le haut
pendown()
arbre(120, 9)
hideturtle()
done()
