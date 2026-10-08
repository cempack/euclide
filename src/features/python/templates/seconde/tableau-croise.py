# Modèle : Tableau croisé
# Résumé : Effectifs, fréquences marginales et conditionnelles.

# On a interrogé 24 élèves sur leur niveau (S = seconde, P = première)
# et leur régime (D = demi-pensionnaire, E = externe). On croise les deux.

reponses = "SD SE PD SD PE SD SD SE PD SD PE SE PD SD SD PE SE PD SD SE PD SD PE PD".split()


def effectif(niveau, regime):
    """Renvoie le nombre d'élèves de ce niveau et de ce régime.

    >>> effectif("S", "D")
    9
    >>> effectif("P", "E")
    4
    """
    n = 0
    for r in reponses:
        if r == niveau + regime:
            n = n + 1
    return n


def frequence(partie, tout):
    """Renvoie le texte « partie/tout ≈ … % ».

    >>> frequence(9, 14)
    '9/14 ≈ 64.3 %'
    """
    return f"{partie}/{tout} ≈ {100 * partie / tout:.1f} %"


sd, se = effectif("S", "D"), effectif("S", "E")
pd, pe = effectif("P", "D"), effectif("P", "E")
n = len(reponses)

# Le tableau des effectifs ; les totaux sont les effectifs marginaux.
print(f"{'':<10}{'Demi-pension':>14}{'Externe':>10}{'Total':>8}")
print(f"{'Seconde':<10}{sd:>14}{se:>10}{sd + se:>8}")
print(f"{'Première':<10}{pd:>14}{pe:>10}{pd + pe:>8}")
print(f"{'Total':<10}{sd + pd:>14}{se + pe:>10}{n:>8}")
print()

print("Fréquences marginales :")
print("  des secondes parmi tous les élèves :", frequence(sd + se, n))
print("  des demi-pensionnaires parmi tous les élèves :", frequence(sd + pd, n))
print()
print("Fréquences conditionnelles :")
print("  des demi-pensionnaires parmi les secondes :", frequence(sd, sd + se))
print("  des demi-pensionnaires parmi les premières :", frequence(pd, pd + pe))
print("  des secondes parmi les demi-pensionnaires :", frequence(sd, sd + pd))
