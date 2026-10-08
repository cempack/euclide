# Modèle : Suite de Syracuse
# Résumé : Temps de vol et altitude maximale.

# On part d'un entier N > 0 : s'il est pair on le divise par 2, sinon on le
# multiplie par 3 et on ajoute 1. On finit toujours par tomber sur 1… du moins,
# personne n'a jamais trouvé de contre-exemple : c'est la conjecture de Syracuse.
import matplotlib.pyplot as plt


def suivant(n):
    """Le terme qui suit n dans la suite de Syracuse.

    >>> suivant(6)
    3
    >>> suivant(3)
    10
    """
    if n % 2 == 0:
        return n // 2
    return 3 * n + 1


def vol(n):
    """La liste des termes, de n jusqu'au premier 1.

    >>> vol(6)
    [6, 3, 10, 5, 16, 8, 4, 2, 1]
    """
    termes = [n]
    while n != 1:
        n = suivant(n)
        termes.append(n)
    return termes


def temps_de_vol(n):
    """Le nombre d'étapes pour arriver à 1.

    >>> temps_de_vol(6)
    8
    >>> temps_de_vol(27)
    111
    """
    return len(vol(n)) - 1


N = 27
termes = vol(N)
print(f"Vol de {N} : {termes[:10]} …")
print("Temps de vol :", temps_de_vol(N))
print("Altitude maximale :", max(termes))

# Le plus long vol pour un départ entre 1 et 1000.
record, depart = 0, 1
for n in range(1, 1001):
    if temps_de_vol(n) > record:
        record, depart = temps_de_vol(n), n
print(f"Entre 1 et 1000, le plus long vol part de {depart} : {record} étapes.")

plt.plot(list(range(len(termes))), termes, marker=".")
plt.xlabel("étape")
plt.ylabel("altitude")
plt.title(f"Le vol de {N}")
plt.grid(True)
plt.show()
