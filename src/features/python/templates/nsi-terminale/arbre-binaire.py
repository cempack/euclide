# Modèle : Arbre binaire
# Résumé : Taille, hauteur, parcours préfixe, infixe, suffixe.

# Un arbre binaire est vide (None) ou un nœud : une valeur, un sous-arbre
# gauche et un sous-arbre droit. Les fonctions suivent cette définition
# récursive. Convention : un arbre réduit à sa racine est de hauteur 1.


class Noeud:
    """Un nœud : une valeur et ses deux sous-arbres (None pour un arbre vide)."""

    def __init__(self, valeur, gauche=None, droit=None):
        self.valeur = valeur
        self.gauche = gauche
        self.droit = droit


def taille(arbre):
    """Le nombre de nœuds de l'arbre.

    >>> taille(Noeud(1, Noeud(2), Noeud(3)))
    3
    >>> taille(None)
    0
    """
    if arbre is None:
        return 0
    return 1 + taille(arbre.gauche) + taille(arbre.droit)


def hauteur(arbre):
    """Le nombre de nœuds du plus long chemin qui va de la racine à une feuille.

    >>> hauteur(Noeud(1, Noeud(2, Noeud(4)), Noeud(3)))
    3
    >>> hauteur(None)
    0
    """
    if arbre is None:
        return 0
    return 1 + max(hauteur(arbre.gauche), hauteur(arbre.droit))


def prefixe(arbre):
    """Les valeurs dans l'ordre préfixe : la racine, puis le sous-arbre gauche, puis le droit.

    >>> prefixe(Noeud(1, Noeud(2), Noeud(3)))
    [1, 2, 3]
    >>> prefixe(None)
    []
    """
    if arbre is None:
        return []
    return [arbre.valeur] + prefixe(arbre.gauche) + prefixe(arbre.droit)


def infixe(arbre):
    """Les valeurs dans l'ordre infixe : le sous-arbre gauche, la racine, puis le droit.

    >>> infixe(Noeud(1, Noeud(2), Noeud(3)))
    [2, 1, 3]
    >>> infixe(None)
    []
    """
    if arbre is None:
        return []
    return infixe(arbre.gauche) + [arbre.valeur] + infixe(arbre.droit)


def suffixe(arbre):
    """Les valeurs dans l'ordre suffixe : le sous-arbre gauche, le droit, puis la racine.

    >>> suffixe(Noeud(1, Noeud(2), Noeud(3)))
    [2, 3, 1]
    >>> suffixe(None)
    []
    """
    if arbre is None:
        return []
    return suffixe(arbre.gauche) + suffixe(arbre.droit) + [arbre.valeur]


def evaluer(arbre):
    """La valeur de l'expression arithmétique écrite en arbre (les feuilles sont des nombres).

    >>> evaluer(Noeud("+", Noeud(2), Noeud(3)))
    5
    >>> evaluer(Noeud("×", Noeud(4), Noeud("−", Noeud(5), Noeud(2))))
    12
    """
    if arbre.gauche is None and arbre.droit is None:
        return arbre.valeur
    a, b = evaluer(arbre.gauche), evaluer(arbre.droit)
    if arbre.valeur == "+":
        return a + b
    if arbre.valeur == "−":
        return a - b
    if arbre.valeur == "×":
        return a * b
    return a / b


def afficher(arbre, decalage=0):
    """Affiche l'arbre couché : la racine à gauche, le sous-arbre droit au-dessus."""
    if arbre is not None:
        afficher(arbre.droit, decalage + 4)
        print(" " * decalage + str(arbre.valeur))
        afficher(arbre.gauche, decalage + 4)


# L'expression (3 + 4) × (5 − 2), écrite en arbre :
expression = Noeud("×", Noeud("+", Noeud(3), Noeud(4)), Noeud("−", Noeud(5), Noeud(2)))
afficher(expression)
print()
print("Taille :", taille(expression), "  hauteur :", hauteur(expression))
print("Préfixe :", *prefixe(expression))
print("Infixe  :", *infixe(expression), "  (il y manque les parenthèses)")
print("Suffixe :", *suffixe(expression), "  (la notation polonaise inverse)")
print("Valeur  :", evaluer(expression))
