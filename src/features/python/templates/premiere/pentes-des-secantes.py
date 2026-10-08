# Modèle : Pentes des sécantes
# Résumé : Le taux de variation quand h tend vers 0.

# f(x) = x² et a = 1. La sécante passe par les points de la courbe d'abscisses
# a et a + h ; sa pente est le taux de variation (f(a + h) − f(a)) / h.
# Que devient cette pente quand h se rapproche de 0 ?
import matplotlib.pyplot as plt


def f(x):
    """x².

    >>> f(3)
    9
    """
    return x**2


def taux_de_variation(a, h):
    """La pente de la sécante entre les points d'abscisses a et a + h.

    >>> taux_de_variation(1, 1)
    3.0
    >>> round(taux_de_variation(1, 0.001), 6)
    2.001
    """
    return (f(a + h) - f(a)) / h


a = 1
for k in range(8):
    h = 10**-k
    print(f"h = {h:<8g} pente = {taux_de_variation(a, h):.8f}")
print("La pente semble tendre vers 2 : c'est le nombre dérivé f'(1).")

xs = [k / 50 for k in range(-25, 151)]
plt.plot(xs, [f(x) for x in xs], color="black", linewidth=3, label="y = x²")
for i, h in enumerate([1.5, 1, 0.5, 0.2]):
    pente = taux_de_variation(a, h)
    couleur = f"C{i + 1}"
    plt.plot(xs, [f(a) + pente * (x - a) for x in xs], color=couleur, label=f"h = {h} : pente {pente:.1f}")
    plt.scatter([a + h], [f(a + h)], color=couleur)
plt.scatter([a], [f(a)], color="black")
plt.xlim(-0.5, 3)
plt.ylim(-1, 7)
plt.title("Des sécantes de plus en plus proches de la tangente en 1")
plt.grid(True)
plt.legend()
plt.show()
