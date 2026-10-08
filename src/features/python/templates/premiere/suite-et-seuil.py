# Modèle : Suite et seuil
# Résumé : Le rang à partir duquel une suite passe sous un seuil.

# Suite (u_n) : u_0 = 1000 et u_(n+1) = 0,9 × u_n + 50.
# Elle décroît vers 500 : à partir de quel rang u_n passe-t-il sous un seuil donné ?


def rang(seuil):
    """Le premier rang n tel que u_n < seuil.

    >>> rang(600)
    16
    >>> rang(1000)
    1
    """
    u = 1000
    n = 0
    while u >= seuil:
        u = 0.9 * u + 50
        n = n + 1
    return n


for seuil in [900, 700, 600, 510, 501]:
    print(f"u_n < {seuil} à partir du rang {rang(seuil)}")

# Attention : avec un seuil inférieur ou égal à 500, la suite ne passe jamais
# dessous et la boucle while ne s'arrêterait pas.
