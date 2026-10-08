# Tri par insertion : chaque élément glisse à sa place parmi les précédents.


def tri_insertion(t):
    """Trie la liste t dans l'ordre croissant, en place.

    >>> l = [5, 2, 9, 1, 5]
    >>> tri_insertion(l)
    >>> l
    [1, 2, 5, 5, 9]
    """
    for i in range(1, len(t)):
        cle = t[i]
        j = i - 1
        while j >= 0 and t[j] > cle:
            t[j + 1] = t[j]
            j = j - 1
        t[j + 1] = cle


l = [31, 4, 15, 9, 26, 5]
tri_insertion(l)
print(l)
