# Modèle : Pile
# Résumé : Une classe : empiler, dépiler, tester si elle est vide.

# Une pile : le dernier élément empilé est le premier dépilé (LIFO).
# L'interface (est_vide, empiler, depiler, sommet) ne dit rien de
# l'implémentation : ici, une liste Python dont on n'utilise que la fin.


class Pile:
    """Une pile, vide à sa création.

    >>> p = Pile()
    >>> p.est_vide()
    True
    >>> p.empiler(1)
    >>> p.empiler(2)
    >>> p.sommet()
    2
    >>> p.depiler()
    2
    >>> p.depiler()
    1
    >>> p.est_vide()
    True
    """

    def __init__(self):
        self.elements = []

    def est_vide(self):
        return len(self.elements) == 0

    def empiler(self, x):
        self.elements.append(x)

    def depiler(self):
        assert not self.est_vide(), "on ne peut pas dépiler une pile vide"
        return self.elements.pop()

    def sommet(self):
        assert not self.est_vide(), "une pile vide n'a pas de sommet"
        return self.elements[-1]


def inverser(mot):
    """Le mot écrit à l'envers, grâce à une pile.

    >>> inverser("pile")
    'elip'
    >>> inverser("")
    ''
    """
    p = Pile()
    for lettre in mot:
        p.empiler(lettre)
    resultat = ""
    while not p.est_vide():
        resultat = resultat + p.depiler()
    return resultat


print("« Bonjour » à l'envers :", inverser("Bonjour"))

# L'historique d'un éditeur de texte : « annuler » défait la dernière action.
historique = Pile()
for action in ["écrire « Bonjour »", "mettre en gras", "changer la couleur"]:
    historique.empiler(action)
    print("Fait :", action)
print("Annuler :", historique.depiler())
print("Annuler :", historique.depiler())
print("Dernière action restante :", historique.sommet())
