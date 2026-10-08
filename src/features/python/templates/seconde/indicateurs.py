# Modèle : Moyenne, médiane, écart type
# Résumé : Les indicateurs d'une série, à la main puis avec statistics.

# Les notes d'une classe au dernier devoir : leurs indicateurs de position et de dispersion.
import statistics
from math import ceil, sqrt

notes = [12, 8, 15, 10, 17, 9, 14, 11, 13, 6, 16, 12, 10, 18, 7]


def moyenne(serie):
    """Renvoie la moyenne de la série.

    >>> moyenne([10, 12, 14])
    12.0
    >>> moyenne([5])
    5.0
    """
    total = 0
    for x in serie:
        total = total + x
    return total / len(serie)


def ecart_type(serie):
    """Renvoie l'écart type : la racine de la moyenne des carrés des écarts à la moyenne.

    >>> round(ecart_type([10, 12, 14]), 4)
    1.633
    >>> ecart_type([5, 5, 5])
    0.0
    """
    m = moyenne(serie)
    total = 0
    for x in serie:
        total = total + (x - m) ** 2
    return sqrt(total / len(serie))


def mediane(serie):
    """Renvoie la médiane : la valeur du milieu de la série rangée dans l'ordre croissant.

    >>> mediane([3, 1, 2])
    2
    >>> mediane([4, 1, 3, 2])
    2.5
    """
    triee = sorted(serie)
    n = len(triee)
    if n % 2 == 1:
        return triee[n // 2]
    return (triee[n // 2 - 1] + triee[n // 2]) / 2


def quartiles(serie):
    """Renvoie (Q1, Q3). Q1 est la plus petite valeur de la série telle qu'au moins
    25 % des valeurs lui soient inférieures ou égales ; 75 % pour Q3.

    >>> quartiles([1, 2, 3, 4, 5, 6, 7, 8])
    (2, 6)
    >>> quartiles([7, 1, 5, 3, 9])
    (3, 7)
    """
    triee = sorted(serie)
    n = len(triee)
    # Les rangs de Q1 et de Q3, en comptant à partir de 1
    rang_q1 = ceil(n / 4)
    rang_q3 = ceil(3 * n / 4)
    return triee[rang_q1 - 1], triee[rang_q3 - 1]


q1, q3 = quartiles(notes)
print(f"Série de {len(notes)} notes, rangée : {sorted(notes)}")
print()
print(f"Moyenne    : {moyenne(notes):.2f}")
print(f"Médiane    : {mediane(notes)}")
print(f"Quartiles  : Q1 = {q1}, Q3 = {q3}, écart interquartile {q3 - q1}")
print(f"Étendue    : {max(notes)} − {min(notes)} = {max(notes) - min(notes)}")
print(f"Écart type : {ecart_type(notes):.2f}")
print()

# Le module statistics donne les mêmes valeurs. Attention : l'écart type du
# lycée est pstdev (on divise par n) ; stdev divise par n − 1.
print(f"Avec statistics : moyenne {statistics.mean(notes):.2f}, médiane {statistics.median(notes)},")
print(f"                  écart type {statistics.pstdev(notes):.2f}")
