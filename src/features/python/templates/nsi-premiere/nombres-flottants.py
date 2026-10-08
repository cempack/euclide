# Modèle : Nombres flottants
# Résumé : 0.1 + 0.2 ≠ 0.3 : pourquoi, et comment comparer.

# Un flottant est écrit en binaire sur 64 bits. Or 0,1 n'a pas d'écriture
# binaire finie : l'ordinateur n'en garde qu'une valeur approchée.
import math
from fractions import Fraction


def ecriture_binaire(x, chiffres):
    """Les premiers chiffres binaires du nombre x (0 ≤ x < 1), après la virgule.

    >>> ecriture_binaire(0.625, 4)
    '0.1010'
    >>> ecriture_binaire(0.1, 12)
    '0.000110011001'
    """
    ecriture = "0."
    for _ in range(chiffres):
        # Multiplier par 2 fait passer le premier chiffre devant la virgule.
        x = 2 * x
        if x >= 1:
            ecriture = ecriture + "1"
            x = x - 1
        else:
            ecriture = ecriture + "0"
    return ecriture


def presque_egaux(a, b, tolerance=1e-9):
    """True si a et b diffèrent de moins de tolerance.

    >>> presque_egaux(0.1 + 0.2, 0.3)
    True
    >>> presque_egaux(1.0, 1.001)
    False
    """
    return abs(a - b) < tolerance


print("0.1 + 0.2 =", 0.1 + 0.2)
print("0.1 + 0.2 == 0.3 :", 0.1 + 0.2 == 0.3)

print()
print("0,1 en binaire :", ecriture_binaire(0.1, 28), "…")
print("La valeur exacte que l'ordinateur garde pour 0.1 :")
print("  ", Fraction(0.1))
print("  ", f"{0.1:.30f}")

print()
print("Comparer avec une tolérance :", presque_egaux(0.1 + 0.2, 0.3))
print("Ou avec math.isclose :", math.isclose(0.1 + 0.2, 0.3))

# Les erreurs s'accumulent, et un petit nombre peut se perdre à côté d'un grand.
print()
total = 0
for _ in range(10):
    total = total + 0.1
print("0.1 ajouté dix fois :", total)
print("1e16 + 1 - 1e16 =", 1e16 + 1 - 1e16)
