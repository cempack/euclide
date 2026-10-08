# Modèle : Chemin et cycle
# Résumé : Un chemin entre deux sommets ; un cycle ?

# Un graphe non orienté, en listes d'adjacence. Un parcours en largeur qui
# retient d'où vient chaque sommet donne un plus court chemin ; un parcours
# en profondeur qui retombe sur un sommet déjà vu (autre que celui d'où il
# vient) révèle un cycle.
from collections import deque

reseau = {
    "Paris": ["Lille", "Rennes", "Lyon", "Strasbourg"],
    "Lille": ["Paris"],
    "Strasbourg": ["Paris"],
    "Rennes": ["Paris", "Nantes"],
    "Nantes": ["Rennes", "Bordeaux"],
    "Bordeaux": ["Nantes", "Toulouse"],
    "Toulouse": ["Bordeaux", "Marseille"],
    "Marseille": ["Toulouse", "Lyon"],
    "Lyon": ["Paris", "Marseille"],
}


def chemin(graphe, depart, arrivee):
    """Un plus court chemin (en nombre d'arêtes) de depart à arrivee, ou None s'il n'y en a pas.

    >>> g = {"A": ["B", "C"], "B": ["A", "D"], "C": ["A", "D"], "D": ["B", "C", "E"], "E": ["D"]}
    >>> chemin(g, "A", "E")
    ['A', 'B', 'D', 'E']
    >>> chemin({"A": [], "B": []}, "A", "B") is None
    True
    """
    parent = {depart: None}
    file = deque([depart])
    while len(file) > 0:
        sommet = file.popleft()
        if sommet == arrivee:
            # On remonte les parents, de l'arrivée jusqu'au départ.
            trajet = []
            while sommet is not None:
                trajet.append(sommet)
                sommet = parent[sommet]
            return trajet[::-1]
        for voisin in graphe[sommet]:
            if voisin not in parent:
                parent[voisin] = sommet
                file.append(voisin)
    return None


def cycle_depuis(graphe, sommet, venu_de, vus):
    """True si un cycle est accessible depuis sommet, atteint en venant de venu_de.

    >>> cycle_depuis({"A": ["B"], "B": ["A"]}, "A", None, set())
    False
    >>> cycle_depuis({"A": ["B", "C"], "B": ["A", "C"], "C": ["A", "B"]}, "A", None, set())
    True
    """
    vus.add(sommet)
    for voisin in graphe[sommet]:
        if voisin != venu_de:
            if voisin in vus or cycle_depuis(graphe, voisin, sommet, vus):
                return True
    return False


def a_un_cycle(graphe):
    """True si le graphe non orienté contient un cycle.

    >>> a_un_cycle({"A": ["B", "C"], "B": ["A", "C"], "C": ["A", "B"]})
    True
    >>> a_un_cycle({"A": ["B"], "B": ["A", "C"], "C": ["B"]})
    False
    """
    vus = set()
    for sommet in graphe:
        if sommet not in vus and cycle_depuis(graphe, sommet, None, vus):
            return True
    return False


def sans_arete(graphe, a, b):
    """Une copie du graphe, sans l'arête qui relie a et b.

    >>> sans_arete({"A": ["B"], "B": ["A"]}, "A", "B")
    {'A': [], 'B': []}
    >>> sans_arete({"A": ["B", "C"], "B": ["A"], "C": ["A"]}, "A", "B")
    {'A': ['C'], 'B': [], 'C': ['A']}
    """
    copie = {sommet: list(voisins) for sommet, voisins in graphe.items()}
    copie[a].remove(b)
    copie[b].remove(a)
    return copie


print("De Lille à Toulouse :", " → ".join(chemin(reseau, "Lille", "Toulouse")))
print("Le réseau a un cycle :", a_un_cycle(reseau))

coupe = sans_arete(reseau, "Lyon", "Marseille")
print()
print("Sans la ligne Lyon – Marseille :")
print("  de Lille à Toulouse :", " → ".join(chemin(coupe, "Lille", "Toulouse")))
print("  le réseau a un cycle :", a_un_cycle(coupe))
