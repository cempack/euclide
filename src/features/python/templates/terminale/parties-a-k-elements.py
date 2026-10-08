# Modèle : Parties à k éléments
# Résumé : Les combinaisons de 2 ou 3 éléments, et leur nombre.

# Une partie à k éléments (une combinaison) : on choisit k objets parmi n,
# sans ordre. Il y en a C(n, k) = n! / (k! × (n − k)!).
import itertools
from math import comb


def parties(ensemble, k):
    """La liste des parties à k éléments de l'ensemble, chacune en liste.

    >>> parties(["a", "b", "c"], 2)
    [['a', 'b'], ['a', 'c'], ['b', 'c']]
    >>> len(parties(range(5), 3))
    10
    >>> parties([1, 2], 0)
    [[]]
    """
    if k == 0:
        return [[]]
    if len(ensemble) < k:
        return []
    premier, reste = ensemble[0], ensemble[1:]
    # Les parties qui contiennent le premier élément, puis celles qui ne le contiennent pas.
    avec = [[premier] + p for p in parties(reste, k - 1)]
    sans = parties(reste, k)
    return avec + sans


couleurs = ["rouge", "vert", "bleu", "jaune", "noir"]
for k in (2, 3):
    choix = parties(couleurs, k)
    print(f"Parties à {k} éléments parmi 5 couleurs : {len(choix)} = C(5, {k})")
    for p in choix:
        print("   {" + ", ".join(p) + "}")
    print()

print("itertools.combinations en trouve autant :", len(list(itertools.combinations(couleurs, 3))))
print("30 élèves se serrent la main deux à deux :", comb(30, 2), "poignées de main")
print(f"Choisir 5 numéros parmi 49 : {comb(49, 5):,} grilles possibles".replace(",", " "))
