# Modèle : Ensemble de Mandelbrot
# Résumé : Les c pour lesquels z² + c reste borné.

# Pour chaque point c, on calcule z_0 = 0, z_(n+1) = z_n² + c. Si un terme
# sort du disque de rayon 2, la suite part à l'infini : c n'est pas dans
# l'ensemble. On colore aussi les points qui s'en échappent lentement.
import matplotlib.pyplot as plt

MAXIMUM = 30  # nombre de termes calculés
PAS = 0.03  # écart entre deux points de la grille


def iterations(c, maximum=MAXIMUM):
    """Le rang du premier terme de module supérieur à 2, ou maximum s'il n'y en a pas.

    >>> iterations(1)
    3
    >>> iterations(-1)
    30
    >>> iterations(0.5j)
    30
    """
    z = 0
    for n in range(1, maximum + 1):
        z = z * z + c
        if z.real * z.real + z.imag * z.imag > 4:  # |z| > 2, sans racine carrée
            return n
    return maximum


dedans, bord = [], []
for i in range(round(2.7 / PAS) + 1):
    for j in range(round(2.4 / PAS) + 1):
        c = complex(-2.1 + i * PAS, -1.2 + j * PAS)
        n = iterations(c)
        if n == MAXIMUM:
            dedans.append(c)
        elif n > 8:
            bord.append(c)

print(f"{len(dedans)} points de la grille sont dans l'ensemble (après {MAXIMUM} termes).")
aire = f"{len(dedans) * PAS * PAS:.2f}".replace(".", ",")
print(f"Aire approchée : {aire}. Avec plus de termes et une grille plus fine, on approche 1,51.")

# Des petits carrés jointifs, en deux couleurs.
x, y = [c.real for c in bord], [c.imag for c in bord]
plt.scatter(x, y, s=14, marker="s", color="#a9c8fb", label="s'échappe lentement")
x, y = [c.real for c in dedans], [c.imag for c in dedans]
plt.scatter(x, y, s=14, marker="s", color="#0f4fa8", label="reste borné")
plt.axis("equal")
plt.xlabel("partie réelle de c")
plt.ylabel("partie imaginaire de c")
plt.title("Ensemble de Mandelbrot")
plt.legend()
plt.show()
