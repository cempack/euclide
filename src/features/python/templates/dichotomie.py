# Encadrer la solution de f(x) = 0 entre a et b par dichotomie.


def f(x):
    return x**2 - 2


def dichotomie(a, b, precision):
    """Un encadrement [a, b] de la solution, d'amplitude au plus precision.

    >>> a, b = dichotomie(1, 2, 0.01)
    >>> a <= 2 ** 0.5 <= b and b - a <= 0.01
    True
    """
    while b - a > precision:
        m = (a + b) / 2
        if f(a) * f(m) <= 0:
            b = m
        else:
            a = m
    return a, b


print(dichotomie(1, 2, 0.001))
