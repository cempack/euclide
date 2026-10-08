# Modèle : Classe Fraction
# Résumé : Les opérateurs +, * et == pour nos propres objets.

# Les méthodes spéciales __add__, __mul__ et __eq__ disent à Python ce que
# signifient +, * et == pour les objets de la classe ; __str__, ce qu'affiche print.
from math import gcd


class Fraction:
    """Une fraction p/q, toujours irréductible, au dénominateur positif.

    >>> print(Fraction(1, 2) + Fraction(1, 3))
    5/6
    >>> print(Fraction(6, -8))
    -3/4
    >>> print(Fraction(3, 4) * Fraction(4, 3))
    1
    >>> Fraction(1, 2) == Fraction(2, 4)
    True
    """

    def __init__(self, numerateur, denominateur=1):
        assert denominateur != 0, "le dénominateur ne peut pas être nul"
        if denominateur < 0:
            numerateur, denominateur = -numerateur, -denominateur
        diviseur = gcd(numerateur, denominateur)
        self.num = numerateur // diviseur
        self.den = denominateur // diviseur

    def __add__(self, autre):
        return Fraction(self.num * autre.den + autre.num * self.den, self.den * autre.den)

    def __mul__(self, autre):
        return Fraction(self.num * autre.num, self.den * autre.den)

    def __eq__(self, autre):
        # Les fractions sont irréductibles : il suffit de comparer num et den.
        return self.num == autre.num and self.den == autre.den

    def __str__(self):
        if self.den == 1:
            return str(self.num)
        return f"{self.num}/{self.den}"

    def valeur(self):
        """La valeur décimale, approchée, de la fraction."""
        return self.num / self.den


somme = Fraction(0)
for k in range(1, 11):
    somme = somme + Fraction(1, k)
print("1 + 1/2 + 1/3 + … + 1/10 =", somme, "≈", round(somme.valeur(), 6))

print("(2/3) × (9/4) =", Fraction(2, 3) * Fraction(9, 4))

# Le calcul est exact, contrairement à celui des flottants.
print("1/10 + 2/10 == 3/10 :", Fraction(1, 10) + Fraction(2, 10) == Fraction(3, 10))
print("0.1 + 0.2 == 0.3 :", 0.1 + 0.2 == 0.3)
