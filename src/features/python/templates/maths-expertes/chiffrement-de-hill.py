# Modèle : Chiffrement de Hill
# Résumé : Des paires de lettres, une matrice inversible modulo 26.

# On code les lettres par paires (x, y), A = 0, …, Z = 25, et on calcule
# (x', y') = M × (x, y) modulo 26. Pour déchiffrer, on multiplie par l'inverse
# de M modulo 26 : il existe si le déterminant de M est premier avec 26.
from math import gcd

ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def chiffrer(texte, matrice):
    """Le texte (lettres seules, un X ajouté si leur nombre est impair) chiffré par paires.

    >>> chiffrer("HILL", [[3, 5], [6, 17]])
    'JWKT'
    """
    lettres = [ALPHABET.index(c) for c in texte.upper() if c in ALPHABET]
    if len(lettres) % 2 == 1:
        lettres.append(ALPHABET.index("X"))
    (a, b), (c, d) = matrice
    resultat = ""
    for i in range(0, len(lettres), 2):
        x, y = lettres[i], lettres[i + 1]
        resultat = resultat + ALPHABET[(a * x + b * y) % 26] + ALPHABET[(c * x + d * y) % 26]
    return resultat


def inverse(matrice):
    """L'inverse modulo 26 d'une matrice 2 × 2 dont le déterminant est premier avec 26.

    >>> inverse([[3, 5], [6, 17]])
    [[7, 1], [22, 15]]
    """
    (a, b), (c, d) = matrice
    k = pow(a * d - b * c, -1, 26)  # l'inverse du déterminant modulo 26
    return [[k * d % 26, -k * b % 26], [-k * c % 26, k * a % 26]]


M = [[3, 5], [6, 17]]
(a, b), (c, d) = M
det = a * d - b * c
print(f"M = {M}, déterminant {det} : premier avec 26 ? {gcd(det, 26) == 1}")
print("Inverse de M modulo 26 :", inverse(M))
print()

message = "RENDEZ VOUS A MIDI"
code = chiffrer(message, M)
print("Message  :", message)
print("Chiffré  :", code)
print("Déchiffré:", chiffrer(code, inverse(M)))

# Deux paires identiques donnent la même paire chiffrée ; mais deux lettres
# identiques, non : « LL » devient « KT ».
print("HILL devient", chiffrer("HILL", M))
