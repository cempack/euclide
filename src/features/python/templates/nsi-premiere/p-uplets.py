# Modèle : p-uplets
# Résumé : Renvoyer plusieurs valeurs et les déballer.

# Un p-uplet (tuple en Python) regroupe plusieurs valeurs, dans un ordre
# donné ; une fois créé, il ne se modifie plus.


def division(a, b):
    """Le quotient et le reste de la division euclidienne de a par b.

    >>> division(17, 5)
    (3, 2)
    >>> division(10, 2)
    (5, 0)
    """
    assert b > 0
    return a // b, a % b


def extremes(valeurs):
    """La plus petite et la plus grande des valeurs (liste non vide).

    >>> extremes([12, 7, 15, 9])
    (7, 15)
    >>> extremes([4])
    (4, 4)
    """
    assert len(valeurs) > 0, "liste vide"
    mini = maxi = valeurs[0]
    for v in valeurs:
        if v < mini:
            mini = v
        if v > maxi:
            maxi = v
    return mini, maxi


point = (3, -2)
print("point =", point, "  abscisse :", point[0], "  ordonnée :", point[1])

# On déballe le p-uplet renvoyé dans deux variables.
quotient, reste = division(17, 5)
print(f"17 = 5 × {quotient} + {reste}")

notes = [12, 7, 15, 9, 18]
plus_basse, plus_haute = extremes(notes)
print("Les notes vont de", plus_basse, "à", plus_haute)

# Échanger deux variables, sans variable intermédiaire.
a, b = 1, 2
a, b = b, a
print("Après l'échange : a =", a, "  b =", b)

try:
    point[0] = 5
except TypeError:
    print("point[0] = 5 → TypeError : un p-uplet ne se modifie pas.")

# Un p-uplet nommé : chaque valeur a un nom. En Python, on l'écrit
# souvent avec un dictionnaire.
eleve = {"nom": "Léa", "classe": "1re G2", "moyenne": 14.5}
print(eleve["nom"], "est en", eleve["classe"], "avec", eleve["moyenne"], "de moyenne.")
