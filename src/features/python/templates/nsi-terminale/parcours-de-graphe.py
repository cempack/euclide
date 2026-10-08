# Modèle : Parcours de graphe
# Résumé : En largeur et en profondeur, depuis un sommet.

# Un graphe non orienté, donné par ses listes d'adjacence : à chaque sommet,
# la liste de ses voisins.
from collections import deque

graphe = {
    "A": ["B", "C"],
    "B": ["A", "D", "E"],
    "C": ["A", "F"],
    "D": ["B"],
    "E": ["B", "F"],
    "F": ["C", "E", "G"],
    "G": ["F"],
}


def parcours_largeur(graphe, depart):
    """Les sommets atteints depuis depart, du plus proche au plus lointain (avec une file).

    >>> parcours_largeur({"A": ["B", "C"], "B": ["A", "D"], "C": ["A"], "D": ["B"]}, "A")
    ['A', 'B', 'C', 'D']
    >>> parcours_largeur({"A": [], "B": []}, "A")
    ['A']
    """
    vus = {depart}
    file = deque([depart])
    ordre = []
    while len(file) > 0:
        sommet = file.popleft()
        ordre.append(sommet)
        for voisin in graphe[sommet]:
            if voisin not in vus:
                vus.add(voisin)
                file.append(voisin)
    return ordre


def parcours_profondeur(graphe, sommet, vus=None):
    """Les sommets atteints depuis sommet, en allant le plus loin possible avant de revenir.

    >>> parcours_profondeur({"A": ["B", "C"], "B": ["A", "D"], "C": ["A"], "D": ["B"]}, "A")
    ['A', 'B', 'D', 'C']
    >>> parcours_profondeur({"A": [], "B": []}, "A")
    ['A']
    """
    if vus is None:
        vus = []
    vus.append(sommet)
    for voisin in graphe[sommet]:
        if voisin not in vus:
            parcours_profondeur(graphe, voisin, vus)
    return vus


def distances(graphe, depart):
    """Le nombre minimal d'arêtes entre depart et chaque sommet qu'on peut atteindre.

    >>> distances({"A": ["B"], "B": ["A", "C"], "C": ["B"]}, "A")
    {'A': 0, 'B': 1, 'C': 2}
    >>> distances({"A": [], "B": []}, "A")
    {'A': 0}
    """
    distance = {depart: 0}
    file = deque([depart])
    while len(file) > 0:
        sommet = file.popleft()
        for voisin in graphe[sommet]:
            if voisin not in distance:
                distance[voisin] = distance[sommet] + 1
                file.append(voisin)
    return distance


print("En largeur depuis A :", *parcours_largeur(graphe, "A"))
print("En profondeur depuis A :", *parcours_profondeur(graphe, "A"))
print("Distances depuis A :")
for sommet, d in distances(graphe, "A").items():
    print(f"  {sommet} : {d} arête{'s' if d > 1 else ''}")
