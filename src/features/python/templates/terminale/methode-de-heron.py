# Modèle : Méthode de Héron
# Résumé : Une suite qui approche √2 très vite.

# u_0 = 1 et u_(n+1) = (u_n + 2 / u_n) / 2 : la suite converge vers √2, et le
# nombre de décimales exactes double environ à chaque étape.
# Le module decimal calcule avec 50 chiffres, bien plus que les flottants.
from decimal import Decimal, getcontext
from math import sqrt


def heron(a, u0, n):
    """Le terme u_n de la suite de Héron qui approche √a, en partant de u0.

    >>> heron(2, 1, 1)
    1.5
    >>> round(heron(2, 1, 4), 12)
    1.414213562375
    >>> abs(heron(9, 1, 6) - 3) < 1e-12
    True
    """
    u = u0
    for _ in range(n):
        u = (u + a / u) / 2
    return u


def decimales_communes(x, y):
    """Le nombre de décimales communes à x et y, écrits en décimal.

    >>> decimales_communes(Decimal("1.4142"), Decimal("1.4151"))
    2
    >>> decimales_communes(1.5, 1.4142)
    0
    """
    a, b = str(x).split(".")[1], str(y).split(".")[1]
    n = 0
    while n < min(len(a), len(b)) and a[n] == b[n]:
        n += 1
    return n


getcontext().prec = 50
racine = Decimal(2).sqrt()
print(f"√2  = {racine}")
for n in range(1, 7):
    u = heron(Decimal(2), Decimal(1), n)
    d = decimales_communes(u, racine)
    s = "s" if d > 1 else ""
    print(f"u_{n} = {u}   ({d} décimale{s} exacte{s})")

print()
print("Les flottants n'ont que 16 chiffres environ : u_5 =", heron(2, 1, 5), "et √2 =", sqrt(2))
