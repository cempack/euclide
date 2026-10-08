# Modèle : Parenthèses équilibrées
# Résumé : Une pile vérifie (), [] et {}.

# On lit l'expression de gauche à droite : chaque ouvrante est empilée ;
# chaque fermante doit correspondre à l'ouvrante au sommet de la pile.

PAIRES = {")": "(", "]": "[", "}": "{"}


def position_erreur(expression):
    """L'indice du premier symbole mal placé, ou None si l'expression est bien parenthésée.

    >>> position_erreur("(a + b) * [c - d]") is None
    True
    >>> position_erreur("(a + b]")
    6
    >>> position_erreur("(a + (b)")
    0
    """
    pile = []  # les indices des ouvrantes pas encore fermées
    for i, symbole in enumerate(expression):
        if symbole in "([{":
            pile.append(i)
        elif symbole in PAIRES:
            if len(pile) == 0 or expression[pile[-1]] != PAIRES[symbole]:
                return i
            pile.pop()
    if len(pile) > 0:
        # Une ouvrante n'a jamais été fermée.
        return pile[-1]
    return None


def est_bien_parenthesee(expression):
    """True si chaque ouvrante est fermée, par la fermante qui lui correspond, dans le bon ordre.

    >>> est_bien_parenthesee("{[()()]}")
    True
    >>> est_bien_parenthesee(")(")
    False
    """
    return position_erreur(expression) is None


for expression in ["(2 + 3) * [4 - (5 + 1)]", "{[()()]}", "(a + b]", "((a + b) * c", ")("]:
    i = position_erreur(expression)
    if i is None:
        print("✓", expression)
    else:
        print("✗", expression)
        print("  " + " " * i + "^")
