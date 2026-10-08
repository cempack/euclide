# Le tableau de valeurs d'une fonction.


def f(x):
    return x**2 - 2 * x - 3


for x in range(-3, 6):
    print(f"f({x}) = {f(x)}")
