# Modèle : Maximum par balayage
# Résumé : Le maximum d'une fonction sur un intervalle, à un pas près.

# Dans un carton carré de 20 cm de côté, on découpe un carré de côté x à chaque coin
# et on replie les bords : la boîte obtenue a pour volume V(x) = x(20 − 2x)².
# On calcule V(x) de pas en pas sur [0 ; 10] et on garde la plus grande valeur.


def volume(x):
    return x * (20 - 2 * x) ** 2


def maximum_par_balayage(a, b, pas):
    """Renvoie (x, V(x)) : le point de [a ; b] où V est la plus grande, de pas en pas.

    >>> x, v = maximum_par_balayage(0, 10, 1)
    >>> x, v
    (3, 588)
    >>> x, v = maximum_par_balayage(0, 10, 0.1)
    >>> round(x, 2), round(v, 2)
    (3.3, 592.55)
    """
    meilleur_x = a
    meilleur_v = volume(a)
    nombre_de_pas = round((b - a) / pas)
    for k in range(nombre_de_pas + 1):
        x = a + k * pas
        if volume(x) > meilleur_v:
            meilleur_x = x
            meilleur_v = volume(x)
    return meilleur_x, meilleur_v


for pas in [1, 0.1, 0.01, 0.001]:
    x, v = maximum_par_balayage(0, 10, pas)
    print(f"Pas de {pas} : maximum en x ≈ {x:.3f} cm, volume ≈ {v:.3f} cm³")

print()
print("Plus le pas est petit, plus le résultat est précis, mais plus il y a de calculs.")
