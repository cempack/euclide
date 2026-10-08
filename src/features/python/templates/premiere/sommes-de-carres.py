# Modèle : Sommes de carrés et de cubes
# Résumé : Comparer aux formules pour les conjecturer.

# S_n = 1² + 2² + … + n² et T_n = 1³ + 2³ + … + n³.
# On les compare à 1 + 2 + … + n : quelles formules peut-on conjecturer ?
from fractions import Fraction


def somme_des_carres(n):
    """1² + 2² + … + n².

    >>> somme_des_carres(3)
    14
    >>> somme_des_carres(10)
    385
    """
    return sum(k**2 for k in range(1, n + 1))


def somme_des_cubes(n):
    """1³ + 2³ + … + n³.

    >>> somme_des_cubes(3)
    36
    >>> somme_des_cubes(10)
    3025
    """
    return sum(k**3 for k in range(1, n + 1))


print(" n   S_n   S_n / (1+…+n)    T_n   (1+…+n)²")
for n in range(1, 13):
    triangle = n * (n + 1) // 2  # 1 + 2 + … + n
    S, T = somme_des_carres(n), somme_des_cubes(n)
    print(f"{n:2} {S:5} {str(Fraction(S, triangle)):>15} {T:6} {triangle**2:10}")

# Conjectures : S_n / (1 + … + n) = (2n + 1) / 3, donc S_n = n(n + 1)(2n + 1) / 6,
# et T_n = (1 + 2 + … + n)². On les teste jusqu'à n = 500.
carres_ok = all(somme_des_carres(n) == n * (n + 1) * (2 * n + 1) // 6 for n in range(1, 501))
cubes_ok = all(somme_des_cubes(n) == (n * (n + 1) // 2) ** 2 for n in range(1, 501))
print()
print("S_n = n(n + 1)(2n + 1) / 6 jusqu'à n = 500 :", carres_ok)
print("T_n = (1 + 2 + … + n)² jusqu'à n = 500     :", cubes_ok)
