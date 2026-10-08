# Modèle : Sac à dos
# Résumé : Glouton selon le rapport valeur/poids, et ses limites.

# Un vélo peut porter 10 kg d'objets à vendre au vide-grenier : lesquels
# emporter pour la plus grande valeur ? Chaque objet est un p-uplet
# (nom, poids en kg, valeur en €).
from itertools import combinations

OBJETS = [
    ("lampe ancienne", 6, 30),
    ("service à thé", 5, 22),
    ("pile de BD", 5, 22),
    ("grille-pain", 4, 12),
    ("livre", 1, 2),
]
CAPACITE = 10


def rapport(objet):
    """La valeur par kilogramme de l'objet.

    >>> rapport(("vase", 4, 10))
    2.5
    >>> rapport(("livre", 1, 2))
    2.0
    """
    return objet[2] / objet[1]


def poids_total(objets):
    """Le poids total des objets.

    >>> poids_total([("a", 6, 30), ("b", 5, 22)])
    11
    >>> poids_total([])
    0
    """
    return sum(objet[1] for objet in objets)


def valeur_totale(objets):
    """La valeur totale des objets.

    >>> valeur_totale([("a", 6, 30), ("b", 5, 22)])
    52
    >>> valeur_totale([])
    0
    """
    return sum(objet[2] for objet in objets)


def sac_glouton(objets, capacite):
    """Les objets choisis en prenant d'abord les plus rentables, tant qu'ils rentrent.

    >>> [nom for nom, _, _ in sac_glouton([("a", 6, 30), ("b", 5, 22), ("c", 5, 22)], 10)]
    ['a']
    >>> sac_glouton([("piano", 200, 900)], 10)
    []
    """
    choisis = []
    for objet in sorted(objets, key=rapport, reverse=True):
        if poids_total(choisis) + objet[1] <= capacite:
            choisis.append(objet)
    return choisis


def meilleur_sac(objets, capacite):
    """Les objets du meilleur choix possible, trouvé en essayant toutes les combinaisons.

    >>> [nom for nom, _, _ in meilleur_sac([("a", 6, 30), ("b", 5, 22), ("c", 5, 22)], 10)]
    ['b', 'c']
    >>> meilleur_sac([("piano", 200, 900)], 10)
    []
    """
    meilleur = []
    for nombre in range(1, len(objets) + 1):
        for choix in combinations(objets, nombre):
            if poids_total(choix) <= capacite and valeur_totale(choix) > valeur_totale(meilleur):
                meilleur = list(choix)
    return meilleur


glouton = sac_glouton(OBJETS, CAPACITE)
meilleur = meilleur_sac(OBJETS, CAPACITE)
for methode, sac in [("Glouton", glouton), ("Meilleur", meilleur)]:
    noms = " + ".join(nom for nom, _, _ in sac)
    print(f"{methode} : {noms} → {poids_total(sac)} kg, {valeur_totale(sac)} €")

# Le glouton ne fait qu'un tri, mais ne trouve pas toujours le meilleur choix.
# Essayer toutes les combinaisons le trouve, mais il y en a 2^n :
print()
print(f"{len(OBJETS)} objets : {2 ** len(OBJETS)} combinaisons ; 50 objets : {2**50:.1e} combinaisons.")
