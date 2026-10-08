# Modèle : Droite passant par deux points
# Résumé : Son équation réduite, ou x = c si elle est verticale.

# Si xa = xb, la droite (AB) a pour équation x = xa. Sinon, elle a pour
# équation y = mx + p, avec m = (yb − ya) / (xb − xa) et p = ya − m × xa.
# Coordonnées entières ou fractions (Fraction(1, 2)) : les calculs restent exacts.
from fractions import Fraction


def ecrire(m, p):
    """Renvoie le texte de l'équation y = mx + p, écrite comme au tableau.

    >>> ecrire(Fraction(2), Fraction(-3))
    'y = 2x - 3'
    >>> ecrire(Fraction(-1, 3), Fraction(0))
    'y = (-1/3)x'
    >>> ecrire(Fraction(0), Fraction(4))
    'y = 4'
    """
    if m == 0:
        return f"y = {p}"
    if m == 1:
        texte = "y = x"
    elif m == -1:
        texte = "y = -x"
    elif m.denominator == 1:
        texte = f"y = {m}x"
    else:
        texte = f"y = ({m})x"
    if p > 0:
        texte = texte + f" + {p}"
    elif p < 0:
        texte = texte + f" - {-p}"
    return texte


def equation(xa, ya, xb, yb):
    """Renvoie l'équation réduite de la droite (AB), pour A et B distincts.

    >>> equation(1, 3, 2, 5)
    'y = 2x + 1'
    >>> equation(0, 1, 3, 0)
    'y = (-1/3)x + 1'
    >>> equation(3, 1, 3, 7)
    'x = 3'
    """
    if xa == xb:
        return f"x = {xa}"
    m = Fraction(yb - ya, xb - xa)
    p = ya - m * xa
    return ecrire(m, p)


for xa, ya, xb, yb in [(1, 3, 2, 5), (0, 1, 3, 0), (-2, 4, 5, 4), (3, 1, 3, 7), (-1, 2, 3, -4)]:
    print(f"A({xa} ; {ya}) et B({xb} ; {yb}) : (AB) a pour équation {equation(xa, ya, xb, yb)}")
print()

# Le point C(10 ; 21) est-il sur la droite d'équation y = 2x + 1 ?
x, y = 10, 21
print(f"2 × {x} + 1 = {2 * x + 1}, donc C est sur la droite :", y == 2 * x + 1)
