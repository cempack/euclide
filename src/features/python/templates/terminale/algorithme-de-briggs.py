# Modèle : Algorithme de Briggs
# Résumé : ln(x) par des racines carrées successives.

# Pour y proche de 1, ln(y) ≈ y − 1. Or ln(x) = 2ⁿ × ln(x^(1/2ⁿ)), et après
# n racines carrées successives, x^(1/2ⁿ) est très proche de 1 :
# ln(x) ≈ 2ⁿ × (x^(1/2ⁿ) − 1).
# Henry Briggs a calculé ainsi, à la main, ses tables de logarithmes (1624).
from math import log, sqrt


def briggs(x, n):
    """Une valeur approchée de ln(x) après n racines carrées successives.

    >>> round(briggs(2, 10), 4)
    0.6934
    >>> abs(briggs(10, 20) - 2.302585) < 1e-5
    True
    """
    for _ in range(n):
        x = sqrt(x)
    return 2**n * (x - 1)


print(f"ln 2 = {log(2):.12f}")
print()
for n in range(5, 55, 5):
    approche = briggs(2, n)
    print(f"n = {n:2} : {approche:.12f}   écart {abs(approche - log(2)):.1e}")
print()
print("L'écart diminue jusque vers n = 30, puis remonte : x^(1/2ⁿ) − 1 devient si petit")
print("que les 16 chiffres des flottants ne suffisent plus à le calculer.")
