# Modèle : Tables de vérité
# Résumé : and, or, not et xor, pour toutes les valeurs.

# Les opérateurs booléens, sur toutes les valeurs possibles des variables
# (1 pour True, 0 pour False).
from itertools import product


def xor(a, b):
    """Le « ou exclusif » : vrai si a ou b est vrai, mais pas les deux.

    >>> xor(True, False)
    True
    >>> xor(True, True)
    False
    """
    return a != b


def equivalentes(f, g, n):
    """True si les fonctions booléennes f et g, à n variables, ont la même table.

    >>> equivalentes(lambda a, b: not (a and b), lambda a, b: not a or not b, 2)
    True
    >>> equivalentes(lambda a, b: not (a and b), lambda a, b: not a and not b, 2)
    False
    """
    for valeurs in product([False, True], repeat=n):
        if f(*valeurs) != g(*valeurs):
            return False
    return True


print(" a  b | non a | a et b | a ou b | a xor b")
for a, b in product([False, True], repeat=2):
    print(f" {a:d}  {b:d} |   {not a:d}   |   {a and b:d}    |   {a or b:d}    |    {xor(a, b):d}")

print()
print("Lois de De Morgan :")
print(
    "  non (a et b) = (non a) ou (non b) :",
    equivalentes(lambda a, b: not (a and b), lambda a, b: not a or not b, 2),
)
print(
    "  non (a ou b) = (non a) et (non b) :",
    equivalentes(lambda a, b: not (a or b), lambda a, b: not a and not b, 2),
)

print()
print("Trois variables : « au moins deux sont vraies »")
for a, b, c in product([False, True], repeat=3):
    print(f" {a:d} {b:d} {c:d} → {(a and b) or (a and c) or (b and c):d}")
