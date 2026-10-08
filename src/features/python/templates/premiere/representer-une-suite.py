# Modèle : Représenter une suite
# Résumé : Les points (n, u_n) avec matplotlib.

# Suite (u_n) : u_0 = 1 et u_(n+1) = 0,5 × u_n + 3.
# On place les points (n, u_n) : la suite semble se rapprocher de 6.
import matplotlib.pyplot as plt


def suivant(u):
    """Le terme qui suit u : 0,5 × u + 3.

    >>> suivant(1)
    3.5
    >>> suivant(6)
    6.0
    """
    return 0.5 * u + 3


rangs = list(range(16))
termes = [1]
for _ in range(15):
    termes.append(suivant(termes[-1]))

for n in rangs[:6]:
    print(f"u_{n} = {termes[n]:.4f}")
print("…")
print(f"u_15 = {termes[15]:.4f}")

plt.scatter(rangs, termes)
plt.axhline(6, color="gray", linestyle="--")
plt.text(13, 5.75, "y = 6")
plt.xlabel("n")
plt.ylabel("u_n")
plt.title("Les premiers termes de la suite (u_n)")
plt.grid(True)
plt.show()
