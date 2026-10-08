# Une classe : des données (attributs) et ce qu'on en fait (méthodes).


class Pile:
    """Le dernier élément empilé est le premier dépilé.

    >>> p = Pile()
    >>> p.empiler(1)
    >>> p.empiler(2)
    >>> p.depiler()
    2
    >>> p.est_vide()
    False
    """

    def __init__(self):
        self.elements = []

    def empiler(self, x):
        self.elements.append(x)

    def depiler(self):
        return self.elements.pop()

    def est_vide(self):
        return len(self.elements) == 0


p = Pile()
for lettre in "abc":
    p.empiler(lettre)
while not p.est_vide():
    print(p.depiler())
