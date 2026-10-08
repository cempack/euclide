# Modèle : Damier
# Résumé : Deux boucles imbriquées, des cases remplies.

# Un damier 8 × 8 : la case (ligne, colonne) est foncée quand ligne + colonne est pair.
from turtle import *

N = 8  # cases par côté
COTE = 50  # côté d'une case


def carre(x, y, cote):
    """Trace un carré de coin inférieur gauche (x, y)."""
    penup()
    goto(x, y)
    pendown()
    for _ in range(4):
        forward(cote)
        left(90)


speed(0)
pencolor("#0F4FA8")
depart = -N * COTE / 2  # pour centrer le damier sur l'origine
for ligne in range(N):
    for colonne in range(N):
        if (ligne + colonne) % 2 == 0:
            fillcolor("#0F4FA8")
        else:
            fillcolor("white")
        begin_fill()
        carre(depart + colonne * COTE, depart + ligne * COTE, COTE)
        end_fill()

# Le cadre, plus épais.
pensize(3)
carre(depart, depart, N * COTE)
hideturtle()
done()
