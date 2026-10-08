# Modèle : Racines n-ièmes de l'unité
# Résumé : n points régulièrement répartis sur le cercle.

# Les solutions de z^n = 1 sont les e^(2ikπ/n), pour k = 0, 1, …, n − 1 :
# les sommets d'un polygone régulier inscrit dans le cercle unité.
import cmath
import math
import matplotlib.pyplot as plt

n = 7


def racines_unite(n):
    """Les n racines n-ièmes de 1, de k = 0 à n − 1.

    >>> len(racines_unite(5))
    5
    >>> all(abs(z**5 - 1) < 1e-12 for z in racines_unite(5))
    True
    >>> abs(sum(racines_unite(5))) < 1e-12
    True
    """
    return [cmath.exp(2j * math.pi * k / n) for k in range(n)]


racines = racines_unite(n)
for k, z in enumerate(racines):
    print(f"ω_{k} = e^(2i × {k}π/{n}) ≈ {z.real:+.4f} {z.imag:+.4f}i")
print(f"Somme des racines : {abs(sum(racines)):.1e} (nulle, aux arrondis près)")

# Le cercle unité, le polygone et ses sommets.
t = [2 * math.pi * k / 200 for k in range(201)]
plt.plot([math.cos(x) for x in t], [math.sin(x) for x in t], color="gray", linewidth=1)
sommets = racines + [racines[0]]
plt.plot([z.real for z in sommets], [z.imag for z in sommets], label=f"polygone à {n} côtés")
plt.scatter([z.real for z in racines], [z.imag for z in racines], s=60, color="red")
for k, z in enumerate(racines):
    plt.text(1.15 * z.real, 1.15 * z.imag, f"ω{k}")
plt.axhline(0, color="gray")
plt.axvline(0, color="gray")
plt.axis("equal")
plt.title(f"Les racines {n}-ièmes de l'unité")
plt.legend()
plt.show()
