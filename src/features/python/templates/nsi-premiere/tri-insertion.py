# Modèle : Tri par insertion
# Résumé : Chaque élément glisse à sa place parmi les précédents.

# À l'étape i, t[:i] est déjà trié : on fait glisser t[i] vers la gauche
# jusqu'à sa place. Coût : environ n²/4 comparaisons en moyenne, mais
# seulement n quand le tableau est déjà presque trié.


def tri_insertion(t, afficher=False):
    """Trie la liste t dans l'ordre croissant, en place.

    >>> notes = [5, 2, 9, 1, 5]
    >>> tri_insertion(notes)
    >>> notes
    [1, 2, 5, 5, 9]
    >>> vide = []
    >>> tri_insertion(vide)
    >>> vide
    []
    """
    for i in range(1, len(t)):
        cle = t[i]
        j = i - 1
        while j >= 0 and t[j] > cle:
            t[j + 1] = t[j]
            j = j - 1
        t[j + 1] = cle
        if afficher:
            print(f"étape {i} :", t)


liste = [31, 4, 15, 9, 26, 5]
print("au départ :", liste)
tri_insertion(liste, afficher=True)
