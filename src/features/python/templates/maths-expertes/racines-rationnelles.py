# Modèle : Racines rationnelles
# Résumé : Les p/q possibles d'un polynôme à coefficients entiers.

# Si p/q (fraction irréductible) est racine de a_n x^n + … + a_1 x + a_0, alors
# p divise a_0 et q divise a_n : il reste un nombre fini de candidats à essayer.
from fractions import Fraction


def valeur(coefficients, x):
    """P(x), les coefficients allant du plus haut degré au terme constant (Horner).

    >>> valeur([2, -3, -11, 6], 3)
    0
    >>> valeur([1, 0, -2], Fraction(3, 2))
    Fraction(1, 4)
    """
    resultat = 0
    for a in coefficients:
        resultat = resultat * x + a
    return resultat


def diviseurs(n):
    """Les diviseurs positifs de n (n ≠ 0).

    >>> diviseurs(-6)
    [1, 2, 3, 6]
    """
    n = abs(n)
    return [d for d in range(1, n + 1) if n % d == 0]


def candidats(coefficients):
    """Les ±p/q avec p diviseur du terme constant (non nul) et q du coefficient dominant.

    >>> [str(x) for x in candidats([2, -3, -11, 6]) if x > 0]
    ['1/2', '1', '3/2', '2', '3', '6']
    """
    p_possibles = diviseurs(coefficients[-1])
    q_possibles = diviseurs(coefficients[0])
    return sorted({s * Fraction(p, q) for p in p_possibles for q in q_possibles for s in (1, -1)})


def racines_rationnelles(coefficients):
    """Les racines rationnelles du polynôme (terme constant non nul), dans l'ordre croissant.

    >>> [str(x) for x in racines_rationnelles([2, -3, -11, 6])]
    ['-2', '1/2', '3']
    >>> racines_rationnelles([1, 0, 0, -2])
    []
    """
    return [x for x in candidats(coefficients) if valeur(coefficients, x) == 0]


polynomes = {
    "2x³ − 3x² − 11x + 6": [2, -3, -11, 6],
    "6x³ − 11x² + 6x − 1": [6, -11, 6, -1],
    "x³ − 2": [1, 0, 0, -2],
}
for ecrit, coefficients in polynomes.items():
    racines = racines_rationnelles(coefficients)
    print(f"P(x) = {ecrit}")
    print(f"  {len(candidats(coefficients))} candidats p/q à essayer")
    if racines:
        print("  racines rationnelles :", ", ".join(str(x) for x in racines))
    else:
        print("  aucune racine rationnelle")
