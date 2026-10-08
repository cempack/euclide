# Modèle : Marche aléatoire sur un graphe
# Résumé : Simulée, puis comparée à la loi stable.

# À chaque étape, on passe à un voisin choisi au hasard. Sur un graphe connexe
# non orienté, la fréquence de passage en s tend vers deg(s) / (somme des degrés).
from random import choice
import matplotlib.pyplot as plt

VOISINS = {
    "A": ["B", "C"],
    "B": ["A", "C", "D"],
    "C": ["A", "B", "D", "E"],
    "D": ["B", "C", "E"],
    "E": ["C", "D"],
}


def loi_stable(voisins):
    """La probabilité de chaque sommet dans la loi stable : son degré sur la somme des degrés.

    >>> loi_stable({"A": ["B"], "B": ["A", "C"], "C": ["B"]})
    {'A': 0.25, 'B': 0.5, 'C': 0.25}
    """
    total = sum(len(v) for v in voisins.values())
    return {s: len(v) / total for s, v in voisins.items()}


def frequences(voisins, depart, n):
    """La fréquence de passage en chaque sommet sur n pas, au hasard, depuis depart.

    >>> round(sum(frequences(VOISINS, "A", 100).values()), 6)
    1.0
    """
    passages = {s: 0 for s in voisins}
    s = depart
    for _ in range(n):
        s = choice(voisins[s])
        passages[s] = passages[s] + 1
    return {s: k / n for s, k in passages.items()}


N = 10_000
simulee = frequences(VOISINS, "A", N)
theorique = loi_stable(VOISINS)
print(f"{'sommet':>6} {'degré':>6} {'fréquence':>10} {'loi stable':>11}")
for s in VOISINS:
    print(f"{s:>6} {len(VOISINS[s]):>6} {simulee[s]:>10.4f} {theorique[s]:>11.4f}")

sommets = list(VOISINS)
plt.bar(sommets, [simulee[s] for s in sommets], label=f"fréquences sur {N} pas")
plt.plot(range(len(sommets)), [theorique[s] for s in sommets], "o", color="red", label="loi stable")
plt.ylabel("probabilité")
plt.title("Marche aléatoire sur un graphe")
plt.legend()
plt.show()
