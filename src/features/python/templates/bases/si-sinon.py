# Modèle : Si… sinon
# Résumé : if, elif, else : la mention selon la moyenne.

# Une condition choisit le bloc qui s'exécute.

n = 7
if n % 2 == 0:
    print(n, "est pair")
else:
    print(n, "est impair")


# Plusieurs cas : elif teste une nouvelle condition si les précédentes sont fausses.
def mention(moyenne):
    """La mention au bac obtenue avec cette moyenne sur 20.

    >>> mention(15.2)
    'Bien'
    >>> mention(10)
    'Admis sans mention'
    >>> mention(8.5)
    'Oral de rattrapage'
    """
    if moyenne >= 16:
        return "Très bien"
    elif moyenne >= 14:
        return "Bien"
    elif moyenne >= 12:
        return "Assez bien"
    elif moyenne >= 10:
        return "Admis sans mention"
    elif moyenne >= 8:
        return "Oral de rattrapage"
    else:
        return "Ajourné"


for moyenne in [17.5, 15.2, 12, 10, 8.5, 6]:
    print(f"{moyenne:>5} / 20 : {mention(moyenne)}")
