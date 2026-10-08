# Modèle : Coût d'un algorithme
# Résumé : Compter les étapes, mesurer le temps.

# Chercher une valeur absente dans un tableau trié de n éléments : la
# recherche séquentielle fait n comparaisons, la dichotomie environ log₂(n).
import time


def sequentielle(t, valeur):
    """Le nombre de comparaisons faites pour chercher valeur dans t, élément par élément.

    >>> sequentielle([1, 3, 5, 7], 3)
    2
    >>> sequentielle([1, 3, 5, 7], 4)
    4
    """
    comparaisons = 0
    for x in t:
        comparaisons = comparaisons + 1
        if x == valeur:
            break
    return comparaisons


def dichotomique(t, valeur):
    """Le nombre de tours faits pour chercher valeur dans t trié, par dichotomie.

    >>> dichotomique([1, 3, 5, 7], 4)
    2
    >>> dichotomique(list(range(1000)), 1000)
    10
    """
    tours = 0
    debut, fin = 0, len(t) - 1
    while debut <= fin:
        tours = tours + 1
        milieu = (debut + fin) // 2
        if t[milieu] == valeur:
            break
        if t[milieu] < valeur:
            debut = milieu + 1
        else:
            fin = milieu - 1
    return tours


def mesure(fonction, t, valeur):
    """Le résultat de fonction(t, valeur), et la durée de l'appel en millisecondes."""
    debut = time.perf_counter()
    resultat = fonction(t, valeur)
    return resultat, (time.perf_counter() - debut) * 1000


print(f"{'n':>9} | {'séquentielle':^22} | {'dichotomie':^20}")
for n in [1_000, 10_000, 100_000, 1_000_000]:
    t = list(range(n))
    # n est plus grand que tous les éléments : c'est le pire cas.
    comparaisons, duree_seq = mesure(sequentielle, t, n)
    tours, duree_dicho = mesure(dichotomique, t, n)
    print(f"{n:>9_} | {comparaisons:>9_} en {duree_seq:6.2f} ms | {tours:>5} en {duree_dicho:7.3f} ms")

print()
print("n multiplié par 10 : dix fois plus de travail pour la recherche séquentielle,")
print("trois ou quatre tours de plus pour la dichotomie.")
