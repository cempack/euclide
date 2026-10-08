# Modèle : Permutations
# Résumé : Les écrire toutes, en compter n!, en tirer une au hasard.

# Une permutation de n objets est une façon de les ranger dans un ordre.
# On choisit le premier (n choix), puis on range les autres : il y en a n!.
import itertools
import random
import textwrap
from math import factorial


def permutations(objets):
    """La liste de toutes les permutations des objets, chacune en liste.

    >>> permutations([1, 2, 3])
    [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]
    >>> len(permutations("ABCDE"))
    120
    """
    if len(objets) <= 1:
        return [list(objets)]
    resultat = []
    for i, premier in enumerate(objets):
        autres = objets[:i] + objets[i + 1 :]
        for suite in permutations(autres):
            resultat.append([premier] + suite)
    return resultat


mots = ["".join(p) for p in permutations("ABCD")]
print(f"Les {len(mots)} permutations de ABCD :")
print(textwrap.fill(" ".join(mots), 60))
print(f"4! = {factorial(4)}, et itertools en trouve {len(list(itertools.permutations('ABCD')))}.")

print()
print("Le nombre de permutations de n objets :")
for n in range(1, 11):
    print(f"{n:5}! = {factorial(n):9}")

# Une permutation au hasard : on mélange la liste.
eleves = ["Alice", "Bilal", "Chloé", "David", "Emma", "Farid"]
random.shuffle(eleves)
print()
print("Ordre de passage au tableau :", ", ".join(eleves))
