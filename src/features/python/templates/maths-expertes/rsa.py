# Modèle : RSA en petit
# Résumé : Deux nombres premiers, une clé publique, une clé privée.

# Clé publique : n = p × q et e, premier avec φ = (p − 1)(q − 1).
# Clé privée : d, l'inverse de e modulo φ. On chiffre m en c = m^e mod n,
# on déchiffre c en c^d mod n. Trouver d sans connaître p et q, c'est factoriser n.
from math import gcd


def chiffrer(m, e, n):
    """m^e modulo n.

    >>> chiffrer(65, 17, 3233)
    2790
    """
    return pow(m, e, n)


def dechiffrer(c, d, n):
    """c^d modulo n.

    >>> dechiffrer(2790, 2753, 3233)
    65
    """
    return pow(c, d, n)


def factoriser(n):
    """Le plus petit facteur p de n et le cofacteur q, en essayant les diviseurs.

    >>> factoriser(3233)
    (53, 61)
    """
    p = 2
    while n % p != 0:
        p = p + 1
    return p, n // p


p, q = 61, 53
n = p * q
phi = (p - 1) * (q - 1)
e = 17
d = pow(e, -1, phi)
print(f"p = {p}, q = {q} : n = {n}, φ = {phi}")
print(f"e = {e} est premier avec φ : {gcd(e, phi) == 1}")
print(f"Clé publique (n, e) = ({n}, {e}), clé privée d = {d} (e × d = {e * d} ≡ 1 mod {phi})")
print()

message = "Maths expertes"
code = [chiffrer(ord(lettre), e, n) for lettre in message]  # ord : le numéro du caractère
print("Chiffré  :", code)
print("Déchiffré:", "".join(chr(dechiffrer(c, d, n)) for c in code))
print()

# Avec un petit n, quelques divisions suffisent à retrouver p et q, donc d.
p2, q2 = factoriser(n)
print(f"Attaque : {n} = {p2} × {q2}, d'où d = {pow(e, -1, (p2 - 1) * (q2 - 1))}.")
print("Avec des nombres premiers de plusieurs centaines de chiffres, personne ne sait le faire.")
