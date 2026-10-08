# Modèle : Équation du second degré
# Résumé : Les racines, réelles ou complexes conjuguées.

# az² + bz + c = 0, avec a, b, c réels et a ≠ 0 : Δ = b² − 4ac.
# Si Δ < 0, les racines sont complexes conjuguées : (−b ± i√(−Δ)) / (2a).
import math


def racines(a, b, c):
    """Les racines de az² + bz + c = 0, réelles (float) ou complexes.

    >>> racines(1, -3, 2)
    (1.0, 2.0)
    >>> racines(1, 2, 5)
    ((-1-2j), (-1+2j))
    >>> racines(1, -2, 1)
    (1.0,)
    """
    delta = b * b - 4 * a * c
    if delta > 0:
        z1 = (-b - math.sqrt(delta)) / (2 * a)
        z2 = (-b + math.sqrt(delta)) / (2 * a)
        return min(z1, z2), max(z1, z2)
    if delta == 0:
        return (-b / (2 * a),)
    racine = math.sqrt(-delta)
    return complex(-b, -racine) / (2 * a), complex(-b, racine) / (2 * a)


def arrondi(z):
    """z arrondi à 4 décimales, réel ou complexe.

    >>> arrondi(2 / 3), arrondi(complex(1 / 3, -0.5))
    (0.6667, (0.3333-0.5j))
    """
    # + 0.0 change un −0.0 d'arrondi en 0.0
    if isinstance(z, complex):
        return complex(round(z.real, 4) + 0.0, round(z.imag, 4) + 0.0)
    return round(z, 4) + 0.0


equations = {
    "z² − 3z + 2 = 0": (1, -3, 2),
    "z² − 2z + 1 = 0": (1, -2, 1),
    "z² + 2z + 5 = 0": (1, 2, 5),
    "2z² − 2z + 1 = 0": (2, -2, 1),
}
for ecrite, (a, b, c) in equations.items():
    solutions = racines(a, b, c)
    print(f"{ecrite:<17} Δ = {b * b - 4 * a * c:>3} :", ", ".join(str(arrondi(z)) for z in solutions))
    for z in solutions:
        assert abs(a * z * z + b * z + c) < 1e-12  # chaque solution vérifie l'équation
print()

# Degré 3 avec une racine connue : z³ − 1 = (z − 1)(z² + z + 1).
z1, z2 = racines(1, 1, 1)
print("z³ = 1 : z = 1, ou z² + z + 1 = 0, soit z =", arrondi(z1), "ou z =", arrondi(z2))
print("Vérification, leurs cubes :", arrondi(z1**3), "et", arrondi(z2**3))
