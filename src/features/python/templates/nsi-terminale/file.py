# Modèle : File
# Résumé : Premier entré, premier sorti, avec deux piles.

# Une file : le premier élément enfilé est le premier défilé (FIFO).
# Implémentation avec deux piles : on enfile sur l'entrée ; pour défiler,
# on prend le sommet de la sortie, après y avoir renversé l'entrée si elle
# était vide. Chaque élément change de pile une seule fois : défiler coûte
# en moyenne un nombre constant d'étapes.


class File:
    """Une file, vide à sa création.

    >>> f = File()
    >>> f.enfiler(1)
    >>> f.enfiler(2)
    >>> f.defiler()
    1
    >>> f.enfiler(3)
    >>> f.defiler()
    2
    >>> f.defiler()
    3
    >>> f.est_vide()
    True
    """

    def __init__(self):
        # Deux listes utilisées comme des piles : on n'en touche que la fin.
        self.entree = []
        self.sortie = []

    def est_vide(self):
        return len(self.entree) == 0 and len(self.sortie) == 0

    def enfiler(self, x):
        self.entree.append(x)

    def defiler(self):
        assert not self.est_vide(), "on ne peut pas défiler une file vide"
        if len(self.sortie) == 0:
            # Renverser l'entrée met le plus ancien élément au sommet de la sortie.
            while len(self.entree) > 0:
                self.sortie.append(self.entree.pop())
        return self.sortie.pop()


# Une file d'impression : les documents sortent dans l'ordre d'arrivée.
impressions = File()
for document in ["cours.pdf", "exercices.pdf", "corrigé.pdf"]:
    impressions.enfiler(document)
    print("Envoyé à l'imprimante :", document)
print("Imprimé :", impressions.defiler())
impressions.enfiler("évaluation.pdf")
print("Envoyé à l'imprimante : évaluation.pdf")
while not impressions.est_vide():
    print("Imprimé :", impressions.defiler())

# Python a une file toute faite : collections.deque, avec append et popleft.
