# Modèle : Récursivité
# Résumé : Une fonction qui s'appelle sur un cas plus petit.

# Une fonction récursive a un cas de base, où elle s'arrête, et un appel
# d'elle-même sur un cas plus petit, qui finit par atteindre le cas de base.


def factorielle(n):
    """n! = 1 × 2 × … × n (et 0! = 1).

    >>> factorielle(0)
    1
    >>> factorielle(5)
    120
    """
    if n == 0:
        return 1
    return n * factorielle(n - 1)


def somme(liste):
    """La somme des éléments de la liste : le premier, plus la somme des autres.

    >>> somme([3, 1, 4, 1, 5])
    14
    >>> somme([])
    0
    """
    if len(liste) == 0:
        return 0
    # liste[1:] est une copie : simple à écrire, mais coûteux pour une longue liste.
    return liste[0] + somme(liste[1:])


def puissance(x, n):
    """x puissance n (n entier naturel), en divisant n par deux à chaque appel.

    >>> puissance(2, 10)
    1024
    >>> puissance(3, 0)
    1
    """
    if n == 0:
        return 1
    moitie = puissance(x, n // 2)
    if n % 2 == 0:
        return moitie * moitie
    return x * moitie * moitie


def factorielle_commentee(n, profondeur=0):
    """factorielle, en affichant chaque appel puis chaque valeur renvoyée."""
    print("    " * profondeur + f"factorielle({n})")
    if n == 0:
        resultat = 1
    else:
        resultat = n * factorielle_commentee(n - 1, profondeur + 1)
    print("    " * profondeur + f"→ {resultat}")
    return resultat


print("Factorielles :", [factorielle(n) for n in range(8)])
print("Somme :", somme([3, 1, 4, 1, 5, 9, 2, 6]))
print("2 puissance 100 :", puissance(2, 100))

print()
print("Les appels s'empilent, puis les résultats remontent :")
factorielle_commentee(4)
