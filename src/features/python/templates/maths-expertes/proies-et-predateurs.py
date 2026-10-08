# Modèle : Proies et prédateurs
# Résumé : Deux suites couplées qui oscillent.

# u_n proies et v_n prédateurs (modèle de Lotka-Volterra discrétisé) :
# u_(n+1) = u_n × (1 + a − b × v_n)   les proies croissent, et sont mangées ;
# v_(n+1) = v_n × (1 − c + d × u_n)   les prédateurs meurent, sauf s'ils mangent.
import matplotlib.pyplot as plt

a, b = 0.03, 0.0001
c, d = 0.04, 0.00002
u0, v0 = 3000, 200
N = 500


def suivant(u, v):
    """Le couple (u_(n+1), v_(n+1)) à partir de (u_n, v_n).

    >>> [round(x, 6) for x in suivant(2000, 300)]
    [2000.0, 300.0]
    """
    return u * (1 + a - b * v), v * (1 - c + d * u)


proies, predateurs = [u0], [v0]
for _ in range(N):
    u, v = suivant(proies[-1], predateurs[-1])
    proies.append(u)
    predateurs.append(v)

print(f"Équilibre : u = c/d = {c / d:.0f} proies, v = a/b = {a / b:.0f} prédateurs")
print(f"Proies : entre {min(proies):.0f} et {max(proies):.0f}")
print(f"Prédateurs : entre {min(predateurs):.0f} et {max(predateurs):.0f}")

plt.plot(range(N + 1), proies, label="proies u_n")
plt.plot(range(N + 1), [10 * v for v in predateurs], label="prédateurs v_n (× 10)")
plt.xlabel("n")
plt.ylabel("effectif")
plt.title("Proies et prédateurs")
plt.legend()
plt.show()

# Les points (u_n, v_n) tournent autour de l'équilibre.
plt.plot(proies, predateurs)
plt.scatter([c / d], [a / b], color="red", label="équilibre")
plt.xlabel("proies")
plt.ylabel("prédateurs")
plt.title("Le cycle proies-prédateurs")
plt.legend()
plt.show()
