# Modèle : Tri fusion
# Résumé : Diviser pour régner : couper, trier, fusionner.

# Diviser pour régner : on coupe la liste en deux, on trie chaque moitié
# (récursivement), puis on fusionne les deux moitiés triées.
# Coût : environ n × log₂(n) comparaisons, contre n²/4 pour le tri par insertion.
import random
import time


def fusion(t1, t2):
    """Une liste triée, faite des éléments des deux listes triées t1 et t2.

    >>> fusion([1, 4, 9], [2, 3, 10])
    [1, 2, 3, 4, 9, 10]
    >>> fusion([], [5])
    [5]
    """
    resultat = []
    i, j = 0, 0
    while i < len(t1) and j < len(t2):
        if t1[i] <= t2[j]:
            resultat.append(t1[i])
            i = i + 1
        else:
            resultat.append(t2[j])
            j = j + 1
    # L'une des deux listes est épuisée : on ajoute ce qui reste de l'autre.
    return resultat + t1[i:] + t2[j:]


def tri_fusion(t, afficher=False, niveau=0):
    """Une nouvelle liste : les éléments de t dans l'ordre croissant.

    >>> tri_fusion([5, 2, 4, 6, 1, 3])
    [1, 2, 3, 4, 5, 6]
    >>> tri_fusion([])
    []
    """
    if len(t) <= 1:
        return list(t)
    milieu = len(t) // 2
    gauche = tri_fusion(t[:milieu], afficher, niveau + 1)
    droite = tri_fusion(t[milieu:], afficher, niveau + 1)
    resultat = fusion(gauche, droite)
    if afficher:
        print("    " * niveau + f"{gauche} + {droite} → {resultat}")
    return resultat


def tri_insertion(t):
    """Une nouvelle liste triée, par insertion, pour comparer.

    >>> tri_insertion([3, 1, 2])
    [1, 2, 3]
    >>> tri_insertion([])
    []
    """
    t = list(t)
    for i in range(1, len(t)):
        cle = t[i]
        j = i - 1
        while j >= 0 and t[j] > cle:
            t[j + 1] = t[j]
            j = j - 1
        t[j + 1] = cle
    return t


def duree(tri, t):
    """La durée du tri de la liste t, en millisecondes."""
    debut = time.perf_counter()
    tri(t)
    return (time.perf_counter() - debut) * 1000


print("Les fusions, des plus petites listes à la liste entière :")
tri_fusion([38, 27, 43, 3, 9, 82, 10, 15], afficher=True)

print()
print(f"{'n':>6} | {'insertion':>12} | {'fusion':>9}")
for n in [500, 1000, 2000]:
    t = [random.random() for _ in range(n)]
    print(f"{n:>6} | {duree(tri_insertion, t):>9.1f} ms | {duree(tri_fusion, t):>6.1f} ms")
print("Quand n double, l'insertion prend quatre fois plus de temps, la fusion à peine plus de deux.")
