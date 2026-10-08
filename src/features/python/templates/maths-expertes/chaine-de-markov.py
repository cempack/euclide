# Modèle : Chaîne de Markov
# Résumé : La distribution après n étapes, et l'état stable.

# Le temps du lendemain ne dépend que de celui du jour. M[i][j] est la
# probabilité de passer de l'état i à l'état j ; la distribution (une ligne)
# vérifie π_(n+1) = π_n × M, donc π_n = π_0 × Mⁿ. L'état stable vérifie π × M = π.

ETATS = ["beau", "nuageux", "pluie"]
M = [
    [0.6, 0.3, 0.1],  # depuis « beau »
    [0.3, 0.4, 0.3],  # depuis « nuageux »
    [0.2, 0.4, 0.4],  # depuis « pluie »
]


def etape(pi, M):
    """La distribution suivante : la ligne pi multipliée par la matrice M.

    >>> etape([1, 0], [[0.75, 0.25], [0.5, 0.5]])
    [0.75, 0.25]
    >>> etape([0.5, 0.5], [[0.75, 0.25], [0.5, 0.5]])
    [0.625, 0.375]
    """
    n = len(pi)
    return [sum(pi[i] * M[i][j] for i in range(n)) for j in range(n)]


def distribution(pi, M, n):
    """La distribution après n étapes : π × Mⁿ.

    >>> distribution([1, 0], [[0.75, 0.25], [0.5, 0.5]], 2)
    [0.6875, 0.3125]
    """
    for _ in range(n):
        pi = etape(pi, M)
    return pi


def ligne(pi):
    """Les probabilités de pi, à 4 décimales, en colonnes.

    >>> ligne([0.5, 0.25])
    '  0.5000  0.2500'
    """
    return "".join(f"{p:>8.4f}" for p in pi)


pi0 = [1, 0, 0]  # il fait beau aujourd'hui
print(f"{'jour':>4}" + "".join(f"{e:>8}" for e in ETATS))
for n in [0, 1, 2, 3, 5, 10, 20]:
    print(f"{n:>4}" + ligne(distribution(pi0, M, n)))
print()

# Quel que soit le temps de départ, la distribution se stabilise.
stable = distribution([0, 0, 1], M, 100)
print("Partant de la pluie, après 100 jours :", ligne(stable))
suivante = etape(stable, M)
print("π × M = π ?", all(abs(suivante[j] - stable[j]) < 1e-12 for j in range(len(stable))))
