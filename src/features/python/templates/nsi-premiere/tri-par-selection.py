# Modèle : Tri par sélection
# Résumé : Chercher le minimum et le placer devant.

# À l'étape i, on cherche le plus petit élément de t[i:] et on l'échange
# avec t[i] : le début du tableau est trié et ne bougera plus.
# Coût : environ n²/2 comparaisons, quel que soit l'ordre de départ.


def indice_du_minimum(t, debut):
    """L'indice du plus petit élément de t parmi ceux d'indice debut ou plus.

    >>> indice_du_minimum([5, 2, 9, 1, 7], 0)
    3
    >>> indice_du_minimum([5, 2, 9, 1, 7], 4)
    4
    """
    indice = debut
    for j in range(debut + 1, len(t)):
        if t[j] < t[indice]:
            indice = j
    return indice


def tri_selection(t, afficher=False):
    """Trie la liste t dans l'ordre croissant, en place.

    >>> notes = [12, 5, 18, 5, 9]
    >>> tri_selection(notes)
    >>> notes
    [5, 5, 9, 12, 18]
    >>> vide = []
    >>> tri_selection(vide)
    >>> vide
    []
    """
    for i in range(len(t) - 1):
        j = indice_du_minimum(t, i)
        t[i], t[j] = t[j], t[i]
        if afficher:
            print(f"étape {i + 1} :", t)


liste = [31, 4, 15, 9, 26, 5]
print("au départ :", liste)
tri_selection(liste, afficher=True)
