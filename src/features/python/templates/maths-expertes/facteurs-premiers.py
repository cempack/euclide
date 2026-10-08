# Modèle : Décomposition en facteurs premiers
# Résumé : 360 = 2³ × 3² × 5.

# On divise par 2 tant qu'on peut, puis par 3, par 4 (qui ne divise plus),
# par 5… jusqu'à √n : ce qui reste, s'il dépasse 1, est premier.

EXPOSANTS = str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹")


def facteurs(n):
    """Les facteurs premiers de n (n ≥ 2), avec leurs exposants.

    >>> facteurs(360)
    {2: 3, 3: 2, 5: 1}
    >>> facteurs(97)
    {97: 1}
    """
    resultat = {}
    d = 2
    while d * d <= n:
        while n % d == 0:
            resultat[d] = resultat.get(d, 0) + 1
            n = n // d
        d = d + 1
    if n > 1:
        resultat[n] = resultat.get(n, 0) + 1
    return resultat


def ecriture(n):
    """La décomposition de n, écrite comme au tableau.

    >>> ecriture(360)
    '360 = 2³ × 3² × 5'
    >>> ecriture(1024)
    '1024 = 2¹⁰'
    """
    termes = []
    for p, k in facteurs(n).items():
        termes.append(str(p) if k == 1 else str(p) + str(k).translate(EXPOSANTS))
    return f"{n} = " + " × ".join(termes)


def nombre_de_diviseurs(n):
    """Le nombre de diviseurs de n : le produit des (exposant + 1).

    >>> nombre_de_diviseurs(360)
    24
    >>> nombre_de_diviseurs(97)
    2
    """
    total = 1
    for k in facteurs(n).values():
        total = total * (k + 1)
    return total


for n in [360, 1001, 2024, 2025, 2026, 65_536, 999_999]:
    print(f"{ecriture(n):<31} {nombre_de_diviseurs(n):>2} diviseurs")
