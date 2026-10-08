# Modèle : Écrire une fonction
# Résumé : def, des paramètres, return, puis des appels.

# Une fonction reçoit des valeurs (ses paramètres) et renvoie un résultat avec return.
# Les exemples (>>>) de chaque fonction sont vérifiés par « Vérifier ».
from math import pi


def aire_disque(rayon):
    """L'aire d'un disque de ce rayon.

    >>> round(aire_disque(1), 4)
    3.1416
    >>> aire_disque(0)
    0.0
    """
    return pi * rayon**2


def est_pair(n):
    """True si l'entier n est pair, False sinon.

    >>> est_pair(4)
    True
    >>> est_pair(7)
    False
    """
    return n % 2 == 0


def prix_solde(prix, remise):
    """Le prix après une remise de remise %.

    >>> prix_solde(80, 25)
    60.0
    >>> prix_solde(19.99, 0)
    19.99
    """
    return prix * (1 - remise / 100)


print(f"Aire d'un disque de rayon 3 : {aire_disque(3):.2f}")
print("12 est pair :", est_pair(12))
print(f"Un article à 45 €, soldé à 30 % : {prix_solde(45, 30):.2f} €")
