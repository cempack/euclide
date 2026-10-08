# Compter les lettres d'un texte avec un dictionnaire.


def compter(texte):
    """Combien de fois chaque lettre apparaît.

    >>> compter("abba")
    {'a': 2, 'b': 2}
    """
    compte = {}
    for lettre in texte:
        compte[lettre] = compte.get(lettre, 0) + 1
    return compte


for lettre, n in sorted(compter("abracadabra").items()):
    print(lettre, n)
