# Modèle : Parcours séquentiel
# Résumé : Maximum, moyenne, occurrences : un seul passage.

# Un parcours séquentiel lit chaque élément du tableau une fois : son coût
# est proportionnel à la longueur du tableau (coût linéaire).


def maximum(t):
    """Le plus grand élément du tableau t, non vide.

    >>> maximum([3, 17, 8, 17, 2])
    17
    >>> maximum([-4])
    -4
    """
    assert len(t) > 0, "tableau vide"
    plus_grand = t[0]
    for x in t:
        if x > plus_grand:
            plus_grand = x
    return plus_grand


def moyenne(t):
    """La moyenne des éléments du tableau t, non vide.

    >>> moyenne([10, 12, 17])
    13.0
    >>> moyenne([7])
    7.0
    """
    assert len(t) > 0, "tableau vide"
    somme = 0
    for x in t:
        somme = somme + x
    return somme / len(t)


def occurrences(t, valeur):
    """Le nombre de fois où valeur apparaît dans le tableau t.

    >>> occurrences([3, 17, 8, 17, 2], 17)
    2
    >>> occurrences([], 1)
    0
    """
    compte = 0
    for x in t:
        if x == valeur:
            compte = compte + 1
    return compte


def premiere_position(t, valeur):
    """L'indice de la première occurrence de valeur dans t, ou None si elle n'y est pas.

    >>> premiere_position([3, 17, 8, 17, 2], 17)
    1
    >>> premiere_position([3, 17], 5) is None
    True
    """
    for i in range(len(t)):
        if t[i] == valeur:
            # Trouvée : inutile de lire la suite.
            return i
    return None


temperatures = [12, 15, 14, 19, 21, 19, 16]
print("Températures de la semaine :", temperatures)
print("Maximum :", maximum(temperatures), "°C")
print("Moyenne :", round(moyenne(temperatures), 1), "°C")
print("Jours à 19 °C :", occurrences(temperatures, 19))
i = premiere_position(temperatures, 19)
print(f"Première fois à 19 °C : indice {i}, soit le jour n° {i + 1}")
