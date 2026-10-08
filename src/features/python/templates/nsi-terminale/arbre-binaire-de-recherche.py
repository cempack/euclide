# Modèle : Arbre binaire de recherche
# Résumé : Insérer, rechercher, parcourir dans l'ordre.

# Dans un arbre binaire de recherche (ABR), chaque nœud est plus grand que
# les valeurs de son sous-arbre gauche et plus petit que celles du droit.
# Rechercher ou insérer coûte au plus la hauteur de l'arbre.
import random


class Noeud:
    """Un nœud : une valeur et ses deux sous-arbres (None pour un arbre vide)."""

    def __init__(self, valeur, gauche=None, droit=None):
        self.valeur = valeur
        self.gauche = gauche
        self.droit = droit


def inserer(arbre, valeur):
    """L'arbre après l'insertion de valeur, à sa place (un arbre vide est None).

    >>> infixe(inserer(Noeud(5, Noeud(3)), 4))
    [3, 4, 5]
    >>> inserer(None, 7).valeur
    7
    """
    if arbre is None:
        return Noeud(valeur)
    if valeur < arbre.valeur:
        arbre.gauche = inserer(arbre.gauche, valeur)
    else:
        arbre.droit = inserer(arbre.droit, valeur)
    return arbre


def construire(valeurs):
    """L'ABR obtenu en insérant les valeurs une à une, dans l'ordre donné.

    >>> infixe(construire([5, 3, 8, 1, 4]))
    [1, 3, 4, 5, 8]
    >>> construire([]) is None
    True
    """
    arbre = None
    for valeur in valeurs:
        arbre = inserer(arbre, valeur)
    return arbre


def rechercher(arbre, valeur):
    """True si valeur est dans l'arbre : on descend à gauche ou à droite, jamais des deux côtés.

    >>> a = construire([5, 3, 8, 1, 4])
    >>> rechercher(a, 4), rechercher(a, 7)
    (True, False)
    >>> rechercher(None, 1)
    False
    """
    while arbre is not None:
        if valeur == arbre.valeur:
            return True
        if valeur < arbre.valeur:
            arbre = arbre.gauche
        else:
            arbre = arbre.droit
    return False


def minimum(arbre):
    """La plus petite valeur de l'arbre non vide : tout à gauche.

    >>> minimum(construire([5, 3, 8, 1, 4]))
    1
    >>> minimum(Noeud(4))
    4
    """
    while arbre.gauche is not None:
        arbre = arbre.gauche
    return arbre.valeur


def infixe(arbre):
    """Les valeurs dans l'ordre infixe, c'est-à-dire, pour un ABR, dans l'ordre croissant.

    >>> infixe(construire([2, 3, 1]))
    [1, 2, 3]
    >>> infixe(None)
    []
    """
    if arbre is None:
        return []
    return infixe(arbre.gauche) + [arbre.valeur] + infixe(arbre.droit)


def hauteur(arbre):
    """La hauteur de l'arbre (1 pour un arbre réduit à sa racine).

    >>> hauteur(construire([1, 2, 3]))
    3
    >>> hauteur(construire([2, 1, 3]))
    2
    """
    if arbre is None:
        return 0
    return 1 + max(hauteur(arbre.gauche), hauteur(arbre.droit))


equilibre = [8, 4, 12, 2, 6, 10, 14, 1, 3, 5, 7, 9, 11, 13, 15]
arbre = construire(equilibre)
print("Les valeurs de 1 à 15, insérées dans l'ordre", *equilibre[:7], "…")
print("  parcours infixe :", infixe(arbre))
print("  hauteur :", hauteur(arbre), "  minimum :", minimum(arbre))
print("  15 est-il dans l'arbre ?", rechercher(arbre, 15), "  et 16 ?", rechercher(arbre, 16))

# La forme de l'arbre dépend de l'ordre d'insertion, et le coût de la recherche aussi.
valeurs = list(range(1, 16))
print()
print("Les mêmes valeurs insérées dans l'ordre croissant : hauteur", hauteur(construire(valeurs)))
random.shuffle(valeurs)
print("Dans un ordre au hasard", valeurs, ": hauteur", hauteur(construire(valeurs)))
