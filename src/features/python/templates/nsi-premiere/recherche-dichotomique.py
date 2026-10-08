# Modèle : Recherche dichotomique
# Résumé : Dans un tableau trié, couper en deux à chaque étape.

# On compare la valeur cherchée à l'élément du milieu, puis on ne garde que
# la moitié du tableau où elle peut se trouver. Précondition : t est trié.


def recherche_dichotomique(t, valeur, afficher=False):
    """L'indice de valeur dans le tableau trié t, ou None si elle n'y est pas.

    >>> recherche_dichotomique([2, 3, 5, 7, 11, 13, 17], 11)
    4
    >>> recherche_dichotomique([2, 3, 5, 7, 11, 13, 17], 4) is None
    True
    >>> recherche_dichotomique([], 4) is None
    True
    """
    debut, fin = 0, len(t) - 1
    while debut <= fin:
        milieu = (debut + fin) // 2
        if afficher:
            print(f"  entre les indices {debut} et {fin} : t[{milieu}] = {t[milieu]}")
        if t[milieu] == valeur:
            return milieu
        if t[milieu] < valeur:
            debut = milieu + 1
        else:
            fin = milieu - 1
    return None


def tours_au_pire(n):
    """Le nombre maximal de tours pour n éléments : combien de fois on peut couper n en deux.

    >>> tours_au_pire(7)
    3
    >>> tours_au_pire(1000)
    10
    """
    tours = 0
    while n > 0:
        n = n // 2
        tours = tours + 1
    return tours


annees = [1515, 1610, 1643, 1789, 1804, 1848, 1870, 1914, 1936, 1945, 1958, 1968, 1981, 1989, 2002]
print("Où est 1789 ?")
print("→ indice", recherche_dichotomique(annees, 1789, afficher=True))
print("Où est 1900 ?")
print("→", recherche_dichotomique(annees, 1900, afficher=True), ": elle n'y est pas")

print()
print(f"{'n':>14} | {'séquentielle':>13} | {'dichotomie':>10}")
for n in [10, 1000, 1_000_000, 1_000_000_000]:
    print(f"{n:>14_} | {n:>13_} | {tours_au_pire(n):>10}")
print("(nombre de tours de boucle au pire)")
