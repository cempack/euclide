# Modèle : Trois points alignés ?
# Résumé : La colinéarité des vecteurs AB et AC.

# A, B et C sont alignés si, et seulement si, les vecteurs AB et AC sont colinéaires,
# c'est-à-dire si det(AB, AC) = x_AB × y_AC − y_AB × x_AC = 0.
from fractions import Fraction


def sont_alignes(xa, ya, xb, yb, xc, yc):
    """Renvoie True si les points A, B et C sont alignés, False sinon.

    >>> sont_alignes(1, 1, 3, 5, 6, 11)
    True
    >>> sont_alignes(1, 1, 3, 5, 6, 12)
    False
    >>> sont_alignes(Fraction(1, 3), 1, 1, 3, 2, 6)
    True
    """
    x_ab, y_ab = xb - xa, yb - ya
    x_ac, y_ac = xc - xa, yc - ya
    return x_ab * y_ac - y_ab * x_ac == 0


print("A(1 ; 1), B(3 ; 5), C(6 ; 11) alignés :", sont_alignes(1, 1, 3, 5, 6, 11))
print("A(1 ; 1), B(3 ; 5), C(6 ; 12) alignés :", sont_alignes(1, 1, 3, 5, 6, 12))
print()

# Attention aux décimaux : A(0 ; 0), B(0,1 ; 0,3) et C(0,3 ; 0,9) sont alignés…
print("Avec des flottants :", sont_alignes(0, 0, 0.1, 0.3, 0.3, 0.9))
print("Le déterminant vaut", 0.1 * 0.9 - 0.3 * 0.3, "au lieu de 0.")

# … mais 0,1 n'a pas d'écriture exacte en binaire. En fractions, le calcul est exact.
dixieme = Fraction(1, 10)
print("Avec des fractions :", sont_alignes(0, 0, dixieme, 3 * dixieme, 3 * dixieme, 9 * dixieme))
