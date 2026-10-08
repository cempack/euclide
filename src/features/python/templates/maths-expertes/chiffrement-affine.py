# Modèle : Chiffrement affine
# Résumé : Chiffrer, puis déchiffrer avec l'inverse modulo 26.

# Chaque lettre x (A = 0, B = 1, …, Z = 25) devient y = (a × x + b) mod 26.
# On déchiffre avec x = a' × (y − b) mod 26, où a' est l'inverse de a modulo 26 :
# il existe si et seulement si a est premier avec 26.
from math import gcd

ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def chiffrer(texte, a, b):
    """Le texte chiffré par x ↦ a × x + b modulo 26 (le reste est recopié).

    >>> chiffrer("MATHS EXPERTES", 7, 3)
    'JDGAZ FIEFSGFZ'
    """
    resultat = ""
    for lettre in texte.upper():
        if lettre in ALPHABET:
            x = ALPHABET.index(lettre)
            resultat = resultat + ALPHABET[(a * x + b) % 26]
        else:
            resultat = resultat + lettre
    return resultat


def dechiffrer(texte, a, b):
    """Le texte déchiffré par y ↦ a' × (y − b) modulo 26, a' inverse de a.

    >>> dechiffrer("JDGAZ FIEFSGFZ", 7, 3)
    'MATHS EXPERTES'
    """
    a_inverse = pow(a, -1, 26)  # l'inverse de a modulo 26
    resultat = ""
    for lettre in texte.upper():
        if lettre in ALPHABET:
            y = ALPHABET.index(lettre)
            resultat = resultat + ALPHABET[a_inverse * (y - b) % 26]
        else:
            resultat = resultat + lettre
    return resultat


a, b = 7, 3
message = "RENDEZ VOUS DEVANT LE CDI A MIDI"
code = chiffrer(message, a, b)
print("Clé : a =", a, "et b =", b)
print("Message  :", message)
print("Chiffré  :", code)
print("Déchiffré:", dechiffrer(code, a, b))
print(f"L'inverse de {a} modulo 26 est {pow(a, -1, 26)} : {a} × {pow(a, -1, 26)} = {a * pow(a, -1, 26)} ≡ 1.")
print()

print("Valeurs de a possibles :", [k for k in range(1, 26) if gcd(k, 26) == 1])
# a doit être premier avec 26 : avec a = 13, deux lettres donnent la même.
print("Avec a = 13, BD devient", chiffrer("BD", 13, 0), ": on ne peut plus déchiffrer.")
