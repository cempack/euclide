# Modèle : Triplets pythagoriciens
# Résumé : Les a² + b² = c², et les primitifs.

# Un triplet est primitif si PGCD(a, b, c) = 1. La formule d'Euclide les donne tous :
# a = m² − n², b = 2mn, c = m² + n², avec m > n > 0 premiers entre eux et de parités différentes.
from math import gcd, isqrt


def triplets(c_max):
    """Les triplets (a, b, c) avec a < b, a² + b² = c² et c ≤ c_max.

    >>> triplets(15)
    [(3, 4, 5), (6, 8, 10), (5, 12, 13), (9, 12, 15)]
    """
    resultat = []
    for c in range(1, c_max + 1):
        for a in range(1, c):
            b = isqrt(c * c - a * a)
            if a < b and a * a + b * b == c * c:
                resultat.append((a, b, c))
    return resultat


def est_primitif(a, b, c):
    """Vrai si a, b et c n'ont pas d'autre diviseur commun que 1.

    >>> est_primitif(3, 4, 5), est_primitif(6, 8, 10)
    (True, False)
    """
    return gcd(a, b, c) == 1


def euclide(m, n):
    """Le triplet (a, b, c), a < b, donné par la formule d'Euclide pour m > n > 0.

    >>> euclide(2, 1)
    (3, 4, 5)
    >>> euclide(3, 2)
    (5, 12, 13)
    """
    a, b = m * m - n * n, 2 * m * n
    return min(a, b), max(a, b), m * m + n * n


print("Triplets avec c ≤ 30 :")
for a, b, c in triplets(30):
    print(f"  {a:>2}² + {b:>2}² = {c:>2}²" + ("  primitif" if est_primitif(a, b, c) else ""))

# Les primitifs avec c ≤ 100, par la formule d'Euclide…
formule = {euclide(m, n) for m in range(2, 10) for n in range(1, m) if gcd(m, n) == 1 and (m - n) % 2 == 1}
formule = {t for t in formule if t[2] <= 100}
# … et en les cherchant parmi tous les triplets.
cherches = {t for t in triplets(100) if est_primitif(*t)}
print(f"Par la formule d'Euclide : {len(formule)} triplets primitifs avec c ≤ 100.")
print("Ce sont exactement ceux qu'on trouve en cherchant :", formule == cherches)
