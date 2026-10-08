# Modèle : Puissance et seuil
# Résumé : La première puissance qui dépasse un seuil, ou passe sous un seuil.

# À partir de quelle puissance 2ⁿ dépasse-t-il 1 000 ?
# Et à partir de quand 0,9ⁿ passe-t-il sous 0,01 ?


def premiere_puissance_au_dessus(q, seuil):
    """Renvoie le plus petit entier n tel que qⁿ > seuil (pour q > 1).

    >>> premiere_puissance_au_dessus(2, 1000)
    10
    >>> premiere_puissance_au_dessus(3, 100)
    5
    """
    n = 0
    puissance = 1
    while puissance <= seuil:
        n = n + 1
        puissance = puissance * q
    return n


def premiere_puissance_en_dessous(q, seuil):
    """Renvoie le plus petit entier n tel que qⁿ < seuil (pour 0 < q < 1).

    >>> premiere_puissance_en_dessous(0.9, 0.01)
    44
    >>> premiere_puissance_en_dessous(0.5, 0.001)
    10
    """
    n = 0
    puissance = 1
    while puissance >= seuil:
        n = n + 1
        puissance = puissance * q
    return n


n = premiere_puissance_au_dessus(2, 1000)
print(f"2^{n} = {2**n} : c'est la première puissance de 2 qui dépasse 1 000.")

n = premiere_puissance_en_dessous(0.9, 0.01)
print(f"0.9^{n} ≈ {0.9**n:.5f} : c'est la première puissance de 0,9 sous 0,01.")
print()

# Une feuille de 0,1 mm d'épaisseur, pliée n fois, mesure 0,1 × 2ⁿ mm.
# Combien de pliages pour dépasser la tour Eiffel (324 m, soit 3 240 000 dixièmes de mm) ?
n = premiere_puissance_au_dessus(2, 3_240_000)
print(f"Il faudrait plier la feuille {n} fois : elle mesurerait alors {0.1 * 2**n / 1000:.0f} m.")
