# Modèle : Suite de Fibonacci
# Résumé : Les termes, et leur quotient qui tend vers le nombre d'or.

# F_0 = 0, F_1 = 1 et F_(n+2) = F_(n+1) + F_n.
# Le quotient F_(n+1) / F_n se rapproche du nombre d'or φ = (1 + √5) / 2.
import math


def fibonacci(n):
    """La liste des termes F_0, F_1, …, F_n.

    >>> fibonacci(1)
    [0, 1]
    >>> fibonacci(10)
    [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55]
    """
    termes = [0, 1]
    for _ in range(n - 1):
        termes.append(termes[-1] + termes[-2])
    return termes[: n + 1]


F = fibonacci(20)
print("De F_0 à F_20 :", F)

phi = (1 + math.sqrt(5)) / 2
print(f"\nNombre d'or : φ = {phi:.10f}")
for n in range(1, 16):
    quotient = F[n + 1] / F[n]
    print(f"F_{n + 1:<2} / F_{n:<2} = {quotient:.10f}   écart avec φ : {abs(quotient - phi):.1e}")
