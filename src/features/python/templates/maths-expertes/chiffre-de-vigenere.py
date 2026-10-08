# Modèle : Chiffre de Vigenère
# Résumé : Une clé, et un décalage qui change à chaque lettre.

# La i-ème lettre du message est décalée de la i-ème lettre de la clé
# (A = 0, B = 1, …), la clé étant répétée autant qu'il faut.

ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def decaler(texte, cle, sens):
    """Le texte dont chaque lettre est décalée de sens × la lettre de clé.

    >>> decaler("ABC", "B", 1)
    'BCD'
    """
    resultat = ""
    i = 0  # rang de la lettre de clé à utiliser
    for lettre in texte.upper():
        if lettre in ALPHABET:
            decalage = ALPHABET.index(cle[i % len(cle)])
            resultat = resultat + ALPHABET[(ALPHABET.index(lettre) + sens * decalage) % 26]
            i = i + 1
        else:
            resultat = resultat + lettre
    return resultat


def chiffrer(texte, cle):
    """Le texte chiffré avec la clé.

    >>> chiffrer("ATTAQUE A L AUBE", "LEMON")
    'LXFODFI M Z NFFQ'
    """
    return decaler(texte, cle, 1)


def dechiffrer(texte, cle):
    """Le texte déchiffré avec la clé.

    >>> dechiffrer("LXFODFI M Z NFFQ", "LEMON")
    'ATTAQUE A L AUBE'
    """
    return decaler(texte, cle, -1)


cle = "EUCLIDE"
message = "LES MATHEMATIQUES SONT LA REINE DES SCIENCES"
code = chiffrer(message, cle)
print("Clé      :", cle)
print("Message  :", message)
print("Chiffré  :", code)
print("Déchiffré:", dechiffrer(code, cle))
print()

# Un même E ne donne pas toujours la même lettre : l'analyse des fréquences
# qui casse le chiffrement de César ne suffit plus.
print("EEEEEEEEE devient", chiffrer("EEEEEEEEE", "CLE"))
