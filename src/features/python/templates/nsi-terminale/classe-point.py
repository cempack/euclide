# Modèle : Une classe : Point
# Résumé : Attributs, méthodes et affichage avec __str__.

# Une classe décrit des objets : leurs attributs (ici les coordonnées) et
# leurs méthodes (ce qu'on peut leur demander). Chaque point créé est une
# instance de la classe.
import math


class Point:
    """Un point du plan, repéré par ses coordonnées.

    >>> a = Point(0, 0)
    >>> b = Point(3, 4)
    >>> a.distance(b)
    5.0
    >>> print(a.milieu(b))
    (1.5 ; 2.0)
    >>> b.translater(1, -1)
    >>> print(b)
    (4 ; 3)
    """

    def __init__(self, x, y):
        # Le constructeur crée les attributs de l'objet, self.
        self.x = x
        self.y = y

    def distance(self, autre):
        """La distance entre ce point et le point autre."""
        return math.sqrt((autre.x - self.x) ** 2 + (autre.y - self.y) ** 2)

    def milieu(self, autre):
        """Un nouveau point : le milieu du segment qui joint ce point au point autre."""
        return Point((self.x + autre.x) / 2, (self.y + autre.y) / 2)

    def translater(self, dx, dy):
        """Déplace ce point : il est modifié, la méthode ne renvoie rien."""
        self.x = self.x + dx
        self.y = self.y + dy

    def __str__(self):
        # Ce qu'affichent print(point) et str(point).
        return f"({self.x} ; {self.y})"


a, b, c = Point(0, 0), Point(4, 0), Point(4, 3)
print("A =", a, "  B =", b, "  C =", c)
print("AB =", a.distance(b), "  BC =", b.distance(c), "  AC =", a.distance(c))
print("Périmètre du triangle ABC :", a.distance(b) + b.distance(c) + c.distance(a))
print("Milieu de [AC] :", a.milieu(c))

c.translater(-4, 0)
print("C après la translation de vecteur (-4 ; 0) :", c)

# Sans méthode __eq__, == compare les objets eux-mêmes, pas leurs coordonnées.
print("Point(1, 2) == Point(1, 2) :", Point(1, 2) == Point(1, 2))
