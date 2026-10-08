# Modèle : Fractions irréductibles
# Résumé : Simplifier avec le PGCD, vérifier avec le module fractions.

# Pour rendre a/b irréductible, on divise a et b par leur PGCD,
# le plus grand entier qui les divise tous les deux.
from fractions import Fraction
from math import gcd


def pgcd(a, b):
    """Renvoie le plus grand diviseur commun des entiers naturels non nuls a et b.

    On part du plus petit des deux et on descend jusqu'au premier diviseur commun.

    >>> pgcd(84, 36)
    12
    >>> pgcd(17, 5)
    1
    """
    d = min(a, b)
    while a % d != 0 or b % d != 0:
        d = d - 1
    return d


def simplifier(a, b):
    """Renvoie (p, q) : la fraction a/b sous forme irréductible.

    >>> simplifier(84, 36)
    (7, 3)
    >>> simplifier(150, 225)
    (2, 3)
    """
    d = pgcd(a, b)
    return a // d, b // d


for a, b in [(84, 36), (150, 225), (17, 5), (1001, 1309)]:
    p, q = simplifier(a, b)
    print(f"{a}/{b} = {p}/{q}    (PGCD = {pgcd(a, b)}, math.gcd donne {gcd(a, b)})")
print()

# Le module fractions simplifie tout seul et calcule de façon exacte.
print("Fraction(84, 36) =", Fraction(84, 36))
print("1/10 + 2/10 en fractions :", Fraction(1, 10) + Fraction(2, 10))
print("1/10 + 2/10 en flottants :", 1 / 10 + 2 / 10)
