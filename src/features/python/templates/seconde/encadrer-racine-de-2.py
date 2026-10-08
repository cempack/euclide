# Modèle : Encadrer √2 par balayage
# Résumé : Avancer par pas de 0,1, puis 0,01… jusqu'à 10⁻⁶.
# Script : encadrer racine de 2

# 1² ≤ 2 < 2², donc 1 ≤ √2 < 2. On avance par pas de 0,1 tant que le carré
# reste inférieur ou égal à 2, puis on repart de là avec un pas de 0,01, etc.
from math import sqrt


def encadrement(n):
    """Renvoie (a, b) tels que a ≤ √2 ≤ b et b − a = 10⁻ⁿ, par balayages successifs.

    >>> encadrement(1)
    (1.4, 1.5)
    >>> encadrement(3)
    (1.414, 1.415)
    """
    a = 1
    for k in range(1, n + 1):
        pas = 10**-k
        while (a + pas) ** 2 <= 2:
            a = round(a + pas, k)
    return a, round(a + 10**-n, n)


for n in range(1, 7):
    a, b = encadrement(n)
    print(f"{a:.{n}f} ≤ √2 ≤ {b:.{n}f}    (amplitude {10**-n:.{n}f})")

print()
print("Valeur donnée par Python :", sqrt(2))
