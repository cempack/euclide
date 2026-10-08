# Modèle : Plus grand multiple
# Résumé : Le plus grand multiple de a inférieur ou égal à b.

# a et b sont deux entiers naturels, a non nul : on cherche le plus grand
# multiple de a qui ne dépasse pas b.


def plus_grand_multiple(a, b):
    """Renvoie le plus grand multiple de a inférieur ou égal à b.

    On avance de a en a tant que le multiple suivant ne dépasse pas b.

    >>> plus_grand_multiple(7, 50)
    49
    >>> plus_grand_multiple(5, 50)
    50
    >>> plus_grand_multiple(12, 7)
    0
    """
    m = 0
    while m + a <= b:
        m = m + a
    return m


def plus_grand_multiple_direct(a, b):
    """Renvoie le même nombre, sans boucle : le quotient entier de b par a, fois a.

    >>> plus_grand_multiple_direct(7, 50)
    49
    >>> plus_grand_multiple_direct(12, 7)
    0
    """
    return (b // a) * a


for a, b in [(7, 100), (12, 365), (25, 1000)]:
    m = plus_grand_multiple(a, b)
    print(f"Le plus grand multiple de {a} inférieur ou égal à {b} est {m}.")
    print(f"  Sans boucle : {b} // {a} = {b // a}, et {b // a} × {a} = {plus_grand_multiple_direct(a, b)}.")
