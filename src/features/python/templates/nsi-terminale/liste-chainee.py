# Modèle : Liste chaînée
# Résumé : Des maillons reliés : longueur, ajout, recherche.

# Chaque maillon contient une valeur et le maillon suivant (None à la fin).
# Ajouter en tête coûte une seule étape ; atteindre le i-ème élément, i étapes.


class Maillon:
    """Un maillon : une valeur, et le maillon qui le suit."""

    def __init__(self, valeur, suivant=None):
        self.valeur = valeur
        self.suivant = suivant


class ListeChainee:
    """Une liste chaînée, repérée par son premier maillon (sa tête).

    >>> liste = ListeChainee()
    >>> liste.est_vide()
    True
    >>> for x in [3, 1, 4]:
    ...     liste.ajouter_en_tete(x)
    >>> print(liste)
    4 → 1 → 3
    >>> liste.longueur()
    3
    >>> liste.contient(1), liste.contient(5)
    (True, False)
    >>> liste.element(2)
    3
    """

    def __init__(self):
        self.tete = None

    def est_vide(self):
        return self.tete is None

    def ajouter_en_tete(self, valeur):
        self.tete = Maillon(valeur, self.tete)

    def longueur(self):
        n = 0
        maillon = self.tete
        while maillon is not None:
            n = n + 1
            maillon = maillon.suivant
        return n

    def contient(self, valeur):
        maillon = self.tete
        while maillon is not None:
            if maillon.valeur == valeur:
                return True
            maillon = maillon.suivant
        return False

    def element(self, i):
        """La valeur du maillon d'indice i (la tête a l'indice 0)."""
        maillon = self.tete
        for _ in range(i):
            assert maillon is not None, "indice trop grand"
            maillon = maillon.suivant
        assert maillon is not None, "indice trop grand"
        return maillon.valeur

    def __str__(self):
        valeurs = []
        maillon = self.tete
        while maillon is not None:
            valeurs.append(str(maillon.valeur))
            maillon = maillon.suivant
        return " → ".join(valeurs) if valeurs else "liste vide"


def longueur_recursive(maillon):
    """Le nombre de maillons à partir de maillon : une liste est vide, ou un maillon suivi d'une liste.

    >>> longueur_recursive(Maillon(1, Maillon(2, Maillon(3))))
    3
    >>> longueur_recursive(None)
    0
    """
    if maillon is None:
        return 0
    return 1 + longueur_recursive(maillon.suivant)


semaine = ListeChainee()
for jour in ["vendredi", "jeudi", "mercredi", "mardi", "lundi"]:
    semaine.ajouter_en_tete(jour)
print(semaine)
print(f"Longueur : {semaine.longueur()}   (en récursif : {longueur_recursive(semaine.tete)})")
print("Contient « jeudi » :", semaine.contient("jeudi"))
print("Élément d'indice 2 :", semaine.element(2))
