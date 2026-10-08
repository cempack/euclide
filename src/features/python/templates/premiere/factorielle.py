# Modèle : Factorielle
# Résumé : n! par une boucle, et sa croissance très rapide.

# n! = 1 × 2 × 3 × … × n, et par convention 0! = 1.
import math


def factorielle(n):
    """n! = 1 × 2 × … × n.

    >>> factorielle(0)
    1
    >>> factorielle(5)
    120
    >>> factorielle(20)
    2432902008176640000
    """
    produit = 1
    for k in range(2, n + 1):
        produit = produit * k
    return produit


for n in range(11):
    print(f"{n:2}! = {factorielle(n)}")

# La croissance est très rapide : le premier n tel que n! dépasse un milliard.
n = 0
while factorielle(n) <= 10**9:
    n = n + 1
print()
print(f"{n}! = {factorielle(n)} est le premier à dépasser un milliard.")
print(f"100! s'écrit avec {len(str(factorielle(100)))} chiffres.")
print("Même résultat que math.factorial(100) :", factorielle(100) == math.factorial(100))
