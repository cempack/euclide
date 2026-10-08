# Une fonction récursive : un cas de base, et un appel sur plus petit.


def factorielle(n):
    """n! = 1 × 2 × … × n.

    >>> factorielle(0)
    1
    >>> factorielle(5)
    120
    """
    if n == 0:
        return 1
    return n * factorielle(n - 1)


print([factorielle(n) for n in range(8)])
