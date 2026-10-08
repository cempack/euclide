# Modèle : Approcher e
# Résumé : (1 + 1/n)ⁿ quand n grandit.

# La suite u_n = (1 + 1/n)^n se rapproche de e = exp(1) ≈ 2,71828…
# mais lentement : combien faut-il de termes pour 5 décimales exactes ?
import math


def u(n):
    """(1 + 1/n)^n.

    >>> u(1)
    2.0
    >>> round(u(1000), 4)
    2.7169
    """
    return (1 + 1 / n) ** n


for k in range(8):
    n = 10**k
    print(f"n = {n:>8}   u_n = {u(n):.10f}   écart avec e : {math.e - u(n):.1e}")

# L'écart est à peu près divisé par 10 quand n est multiplié par 10.
# Au-delà de n = 10^15, les calculs en flottants ne suffisent plus : essayez !
