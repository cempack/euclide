# Modèle : Milieu et distance
# Résumé : Le milieu d'un segment, sa longueur, la nature d'un triangle.

# Dans un repère orthonormé, pour A(xa ; ya) et B(xb ; yb) :
# le milieu de [AB] est ((xa + xb) / 2 ; (ya + yb) / 2) et AB = √((xb − xa)² + (yb − ya)²).
from math import isclose, sqrt


def milieu(xa, ya, xb, yb):
    """Renvoie les coordonnées du milieu de [AB].

    >>> milieu(1, 2, 5, 8)
    (3.0, 5.0)
    >>> milieu(-1, 0, 2, 3)
    (0.5, 1.5)
    """
    return (xa + xb) / 2, (ya + yb) / 2


def distance(xa, ya, xb, yb):
    """Renvoie la longueur AB.

    >>> distance(0, 0, 3, 4)
    5.0
    >>> round(distance(1, 1, 2, 2), 4)
    1.4142
    """
    return sqrt((xb - xa) ** 2 + (yb - ya) ** 2)


def nature(xa, ya, xb, yb, xc, yc):
    """Renvoie la nature du triangle ABC, d'après les longueurs de ses côtés.

    Les longueurs sont des flottants : on les compare avec isclose, pas avec ==.

    >>> nature(0, 0, 4, 0, 0, 3)
    'rectangle'
    >>> nature(0, 0, 4, 0, 2, 5)
    'isocèle'
    >>> nature(0, 0, 2, 0, 0, 2)
    'isocèle et rectangle'
    """
    ab = distance(xa, ya, xb, yb)
    bc = distance(xb, yb, xc, yc)
    ac = distance(xa, ya, xc, yc)
    if isclose(ab, bc) and isclose(bc, ac):
        return "équilatéral"
    isocele = isclose(ab, bc) or isclose(bc, ac) or isclose(ab, ac)
    # Pythagore : le carré d'un côté égale la somme des carrés des deux autres.
    rectangle = (
        isclose(ab**2 + ac**2, bc**2) or isclose(ab**2 + bc**2, ac**2) or isclose(ac**2 + bc**2, ab**2)
    )
    if isocele and rectangle:
        return "isocèle et rectangle"
    if isocele:
        return "isocèle"
    if rectangle:
        return "rectangle"
    return "quelconque"


xm, ym = milieu(1, 2, 5, 8)
print(f"A(1 ; 2) et B(5 ; 8) : milieu ({xm:g} ; {ym:g}), AB = {distance(1, 2, 5, 8):.4f}")
print()

triangles = [
    (0, 0, 4, 0, 0, 3),
    (-2, 1, 2, 1, 0, 5),
    (1, 1, 4, 2, 2, 5),
    (0, 0, 5, 1, 2, 3),
]
for xa, ya, xb, yb, xc, yc in triangles:
    print(f"A({xa} ; {ya}), B({xb} ; {yb}), C({xc} ; {yc}) : triangle {nature(xa, ya, xb, yb, xc, yc)}")
