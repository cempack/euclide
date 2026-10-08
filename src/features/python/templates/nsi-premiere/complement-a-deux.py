# Modèle : Complément à deux
# Résumé : Les entiers relatifs sur 8 bits.

# Sur 8 bits, on code les entiers de −128 à 127 : un entier positif par
# son écriture binaire, un entier négatif n par celle de n + 256.

BITS = 8


def code(n):
    """Le code en complément à deux de l'entier n, sur 8 bits.

    >>> code(5)
    '00000101'
    >>> code(-5)
    '11111011'
    >>> code(-128)
    '10000000'
    """
    assert -(2 ** (BITS - 1)) <= n < 2 ** (BITS - 1), "n doit être entre -128 et 127"
    if n < 0:
        n = n + 2**BITS
    return format(n, f"0{BITS}b")


def valeur(code_binaire):
    """L'entier relatif dont code_binaire est le code sur 8 bits.

    >>> valeur("00000101")
    5
    >>> valeur("11111011")
    -5
    >>> valeur("11111111")
    -1
    """
    n = int(code_binaire, 2)
    # Le bit de gauche compte pour −128 au lieu de +128.
    if code_binaire[0] == "1":
        n = n - 2**BITS
    return n


def oppose(code_binaire):
    """Le code de l'opposé : on inverse tous les bits, puis on ajoute 1.

    >>> oppose("00000101")
    '11111011'
    >>> oppose("11111011")
    '00000101'
    """
    inverse = ""
    for bit in code_binaire:
        inverse = inverse + ("1" if bit == "0" else "0")
    return format((int(inverse, 2) + 1) % 2**BITS, f"0{BITS}b")


for n in [0, 1, 5, 127, -1, -5, -128]:
    print(f"{n:>5} → {code(n)}")

print()
print("Inverser les bits puis ajouter 1 donne l'opposé :")
print("  5 :", code(5), "   -5 :", oppose(code(5)))

# Sur 8 bits, 127 + 1 dépasse : le résultat est −128.
somme = format((int(code(127), 2) + int(code(1), 2)) % 2**BITS, "08b")
print("127 + 1 sur 8 bits :", somme, "soit", valeur(somme))
