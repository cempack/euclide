# Modèle : Rendu de monnaie
# Résumé : Glouton : la plus grosse pièce possible d'abord.

# Rendre une somme avec le moins possible de pièces et de billets.
# Stratégie gloutonne : on prend toujours la plus grande valeur qui ne
# dépasse pas ce qu'il reste à rendre.

EUROS = [500, 200, 100, 50, 20, 10, 5, 2, 1]


def rendu_glouton(somme, systeme):
    """Les valeurs rendues par l'algorithme glouton (systeme trié par ordre décroissant).

    >>> rendu_glouton(49, EUROS)
    [20, 20, 5, 2, 2]
    >>> rendu_glouton(0, EUROS)
    []
    >>> rendu_glouton(48, [30, 24, 12, 6, 3, 1])
    [30, 12, 6]
    """
    rendu = []
    for valeur in systeme:
        while somme >= valeur:
            rendu.append(valeur)
            somme = somme - valeur
    return rendu


for somme in [8, 49, 263, 999]:
    rendu = rendu_glouton(somme, EUROS)
    print(f"{somme} € = {' + '.join(str(v) for v in rendu)}   ({len(rendu)} pièces ou billets)")

# Avec les euros, le glouton rend toujours le moins de pièces possible.
# Ce n'est pas vrai de tous les systèmes : au Royaume-Uni, avant 1971, il y
# avait des pièces de 30, 24, 12, 6, 3 et 1 pence.
print()
print("48 pence, en glouton :", rendu_glouton(48, [30, 24, 12, 6, 3, 1]))
print("Pourtant 24 + 24 n'en demande que deux : le glouton n'est pas toujours optimal.")
