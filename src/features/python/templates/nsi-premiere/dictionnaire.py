# Modèle : Dictionnaires
# Résumé : Clés et valeurs : compter les lettres d'un texte.

# Un dictionnaire associe une valeur à chaque clé : on y accède par la clé,
# pas par un indice.


def compter(texte):
    """Le dictionnaire qui associe à chaque lettre du texte son nombre d'apparitions.

    >>> compter("abba")
    {'a': 2, 'b': 2}
    >>> compter("")
    {}
    """
    compte = {}
    for lettre in texte:
        compte[lettre] = compte.get(lettre, 0) + 1
    return compte


def plus_frequente(compte):
    """La clé de plus grande valeur (la première rencontrée en cas d'égalité).

    >>> plus_frequente({"a": 5, "b": 2, "r": 2})
    'a'
    >>> plus_frequente({"x": 1, "y": 3})
    'y'
    """
    meilleure = None
    for cle, valeur in compte.items():
        if meilleure is None or valeur > compte[meilleure]:
            meilleure = cle
    return meilleure


# Lire, ajouter, modifier.
stock = {"cahiers": 12, "stylos": 30, "règles": 5}
stock["gommes"] = 8
stock["cahiers"] = stock["cahiers"] - 2
print("Stylos :", stock["stylos"])
print("Des compas ?", "compas" in stock)
for article, quantite in stock.items():
    print(f"  {article} : {quantite}")

compte = compter("abracadabra")
print()
for lettre in sorted(compte):
    print(lettre, compte[lettre])
print("La plus fréquente :", plus_frequente(compte))
