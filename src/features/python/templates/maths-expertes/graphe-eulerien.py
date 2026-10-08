# Modèle : Graphe eulérien ?
# Résumé : Les sommets de degré impair décident.

# Théorème d'Euler : un graphe connexe a un cycle passant une fois et une seule
# par chaque arête si tous ses sommets sont de degré pair, et une telle chaîne
# s'il a exactement deux sommets de degré impair (elle va de l'un à l'autre).

# Les sept ponts de Königsberg : A et B les rives, C et D les îles.
KONIGSBERG = [("A", "C"), ("A", "C"), ("A", "D"), ("B", "C"), ("B", "C"), ("B", "D"), ("C", "D")]
# La maison à dessiner sans lever le crayon : un carré, ses diagonales, un toit.
MAISON = [("A", "B"), ("B", "C"), ("C", "D"), ("D", "A"), ("A", "C"), ("B", "D"), ("C", "E"), ("D", "E")]


def degres(aretes):
    """Le degré de chaque sommet (une arête compte pour ses deux extrémités).

    >>> degres([("A", "B"), ("A", "B"), ("B", "C")])
    {'A': 2, 'B': 3, 'C': 1}
    """
    d = {}
    for x, y in aretes:
        d[x] = d.get(x, 0) + 1
        d[y] = d.get(y, 0) + 1
    return d


def est_connexe(aretes):
    """Vrai si l'on peut aller de tout sommet à tout autre (parcours en profondeur).

    >>> est_connexe([("A", "B"), ("B", "C")]), est_connexe([("A", "B"), ("C", "D")])
    (True, False)
    """
    voisins = {}
    for x, y in aretes:
        voisins.setdefault(x, []).append(y)
        voisins.setdefault(y, []).append(x)
    vus = {aretes[0][0]}
    a_voir = [aretes[0][0]]
    while a_voir:
        for v in voisins[a_voir.pop()]:
            if v not in vus:
                vus.add(v)
                a_voir.append(v)
    return len(vus) == len(voisins)


def nature(aretes):
    """Ce que le théorème d'Euler dit du graphe.

    >>> nature(KONIGSBERG)
    'ni chaîne ni cycle eulérien'
    >>> nature(MAISON)
    'une chaîne eulérienne'
    """
    impairs = [s for s, d in degres(aretes).items() if d % 2 == 1]
    if not est_connexe(aretes) or len(impairs) not in (0, 2):
        return "ni chaîne ni cycle eulérien"
    return "un cycle eulérien" if not impairs else "une chaîne eulérienne"


def chaine_eulerienne(aretes, chemin):
    """Prolonge chemin (une liste de sommets) en empruntant une fois chaque arête
    restante, en revenant en arrière quand on est bloqué ; None si c'est impossible.

    >>> chaine_eulerienne([("A", "B"), ("B", "C")], ["A"])
    ['A', 'B', 'C']
    """
    if not aretes:
        return chemin
    s = chemin[-1]
    for i, (x, y) in enumerate(aretes):
        if s in (x, y):
            suivant = y if s == x else x
            reste = aretes[:i] + aretes[i + 1 :]
            resultat = chaine_eulerienne(reste, chemin + [suivant])
            if resultat:
                return resultat
    return None


for nom, aretes in [("Königsberg", KONIGSBERG), ("La maison", MAISON)]:
    d = dict(sorted(degres(aretes).items()))
    print(f"{nom} : degrés {d}")
    print(f"  {nature(aretes)}")
    impairs = [s for s in d if d[s] % 2 == 1]
    if len(impairs) in (0, 2) and est_connexe(aretes):
        depart = impairs[0] if impairs else aretes[0][0]
        print("  par exemple :", " → ".join(chaine_eulerienne(aretes, [depart])))
