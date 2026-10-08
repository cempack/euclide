# Modèle : Suite z_(n+1) = a·z_n + b
# Résumé : Des points qui tournent en spirale vers le point fixe.
# Script : suite complexe

# Si a ≠ 1, le point fixe est ω = b / (1 − a), et z_n − ω = aⁿ (z_0 − ω) :
# chaque terme est l'image du précédent par la similitude de centre ω,
# de rapport |a| et d'angle arg(a). Si |a| < 1, les points convergent vers ω.
import cmath
import math
import matplotlib.pyplot as plt

a = 0.9 * cmath.exp(1j * math.pi / 6)  # rapport 0,9, angle 30°
b = 1 + 1j
z0 = 0


def termes(a, b, z0, n):
    """Les termes z_0, z_1, …, z_n.

    >>> termes(0.5, 1, 0, 3)
    [0, 1.0, 1.5, 1.75]
    """
    z = z0
    liste = [z]
    for _ in range(n):
        z = a * z + b
        liste.append(z)
    return liste


def point_fixe(a, b):
    """ω = b / (1 − a), le point que z ↦ a·z + b laisse fixe (a ≠ 1).

    >>> point_fixe(0.5, 1)
    2.0
    >>> point_fixe(1j, 1 + 1j)
    1j
    """
    return b / (1 - a)


z = termes(a, b, z0, 60)
omega = point_fixe(a, b)
print(f"|a| = {abs(a):.2f}, arg(a) = {math.degrees(cmath.phase(a)):.0f}°")
print(f"Point fixe ω ≈ {omega.real:.4f} + {omega.imag:.4f}i")
for n in [0, 10, 20, 40, 60]:
    print(f"|z_{n} − ω| ≈ {abs(z[n] - omega):.4f}")

plt.plot([w.real for w in z], [w.imag for w in z], "o-", label="z_n")
plt.scatter([omega.real], [omega.imag], s=100, color="red", label="point fixe ω")
plt.axis("equal")
plt.grid(True)
plt.legend()
plt.title("z_(n+1) = a·z_n + b")
plt.show()
