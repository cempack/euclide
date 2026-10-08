# Modèle : Code de Hamming
# Résumé : Le code (7, 4) détecte et corrige une erreur.

# Message de 4 bits d1 d2 d3 d4, plus 3 bits de contrôle (sommes modulo 2) :
# on envoie p1 p2 d1 p3 d2 d3 d4 (positions 1 à 7). À la réception, les trois
# contrôles, lus en binaire, donnent la position du bit faux.
from random import randint


def coder(message):
    """Le mot de 7 bits qui code les 4 bits du message.

    >>> coder([1, 0, 1, 1])
    [0, 1, 1, 0, 0, 1, 1]
    """
    d1, d2, d3, d4 = message
    p1 = (d1 + d2 + d4) % 2
    p2 = (d1 + d3 + d4) % 2
    p3 = (d2 + d3 + d4) % 2
    return [p1, p2, d1, p3, d2, d3, d4]


def position_erreur(mot):
    """La position (1 à 7) du bit faux, ou 0 si les trois contrôles sont bons.

    >>> position_erreur([0, 1, 1, 0, 0, 1, 1])
    0
    >>> position_erreur([0, 1, 1, 0, 1, 1, 1])
    5
    """
    b1, b2, b3, b4, b5, b6, b7 = mot
    s1 = (b1 + b3 + b5 + b7) % 2  # les positions dont le bit de poids 1 vaut 1
    s2 = (b2 + b3 + b6 + b7) % 2  # … de poids 2
    s3 = (b4 + b5 + b6 + b7) % 2  # … de poids 4
    return s1 + 2 * s2 + 4 * s3


def decoder(mot):
    """Les 4 bits du message, après avoir corrigé le bit faux s'il y en a un.

    >>> decoder([0, 1, 1, 0, 1, 1, 1])
    [1, 0, 1, 1]
    """
    mot = list(mot)
    k = position_erreur(mot)
    if k != 0:
        mot[k - 1] = 1 - mot[k - 1]
    return [mot[2], mot[4], mot[5], mot[6]]


def ecrire(bits):
    """Les bits à la suite, comme une chaîne.

    >>> ecrire([1, 0, 1, 1])
    '1011'
    """
    return "".join(str(b) for b in bits)


message = [1, 0, 1, 1]
mot = coder(message)
print("Message :", ecrire(message), "  mot envoyé :", ecrire(mot))

# Le bruit change un bit au hasard.
k = randint(1, 7)
recu = list(mot)
recu[k - 1] = 1 - recu[k - 1]
print(f"Reçu    : {ecrire(recu)}   (bit {k} changé)")
print(f"Les contrôles désignent la position {position_erreur(recu)} : message décodé {ecrire(decoder(recu))}")
print()

# Toutes les erreurs d'un bit, sur tous les messages possibles.
corrigees = 0
for n in range(16):
    message = [(n >> 3) & 1, (n >> 2) & 1, (n >> 1) & 1, n & 1]
    for k in range(7):
        recu = coder(message)
        recu[k] = 1 - recu[k]
        if decoder(recu) == message:
            corrigees = corrigees + 1
print(f"Une erreur : {corrigees} cas corrigés sur {16 * 7}.")

# Deux erreurs : le code « corrige » un troisième bit, et se trompe.
recu = coder([1, 0, 1, 1])
recu[0], recu[1] = 1 - recu[0], 1 - recu[1]
print("Deux erreurs : message décodé", ecrire(decoder(recu)), "au lieu de 1011.")
