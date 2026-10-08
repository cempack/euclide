# Modèle : Parcourir une liste
# Résumé : Par les indices ou par les valeurs : somme, maximum, recherche.

# Deux façons de parcourir une liste : par ses valeurs (for x in liste)
# ou par ses indices (for i in range(len(liste))), quand la position compte.


def somme(liste):
    """La somme des éléments de liste.

    >>> somme([3, 1, 4, 1, 5])
    14
    >>> somme([])
    0
    """
    total = 0
    for x in liste:
        total = total + x
    return total


def maximum(liste):
    """Le plus grand élément d'une liste non vide.

    >>> maximum([3, 1, 4, 1, 5])
    5
    >>> maximum([-2, -7])
    -2
    """
    plus_grand = liste[0]
    for x in liste:
        if x > plus_grand:
            plus_grand = x
    return plus_grand


def position(liste, valeur):
    """L'indice de la première apparition de valeur dans liste, ou -1 si elle n'y est pas.

    >>> position([3, 1, 4, 1, 5], 1)
    1
    >>> position([3, 1, 4, 1, 5], 9)
    -1
    """
    for i in range(len(liste)):
        if liste[i] == valeur:
            return i
    return -1


def nombre_de_hausses(liste):
    """Le nombre d'éléments plus grands que celui qui les précède.

    >>> nombre_de_hausses([3, 1, 4, 1, 5])
    2
    >>> nombre_de_hausses([5, 4, 3])
    0
    """
    hausses = 0
    for i in range(1, len(liste)):
        if liste[i] > liste[i - 1]:
            hausses = hausses + 1
    return hausses


temperatures = [12, 14, 13, 17, 19, 18, 21, 20]
print("Températures de la semaine :", temperatures)
print("Moyenne :", round(somme(temperatures) / len(temperatures), 1), "°C")
plus_chaud = maximum(temperatures)
print(f"Maximum : {plus_chaud} °C, le jour n° {position(temperatures, plus_chaud) + 1}")
print("Jours plus chauds que la veille :", nombre_de_hausses(temperatures))
