# Modèle : Binaire et hexadécimal
# Résumé : Convertir à la main, puis avec bin, hex et int.

# Écrire un entier naturel en base 2 ou en base 16 par divisions successives,
# puis revenir à la base 10.

CHIFFRES = "0123456789ABCDEF"


def en_base(n, base):
    """L'écriture de l'entier naturel n dans la base donnée (de 2 à 16).

    >>> en_base(13, 2)
    '1101'
    >>> en_base(255, 16)
    'FF'
    >>> en_base(0, 2)
    '0'
    """
    assert n >= 0 and 2 <= base <= 16
    if n == 0:
        return "0"
    ecriture = ""
    while n > 0:
        # Le reste de la division par la base donne le chiffre de droite.
        ecriture = CHIFFRES[n % base] + ecriture
        n = n // base
    return ecriture


def en_decimal(ecriture, base):
    """La valeur de l'écriture donnée dans la base, en base 10.

    >>> en_decimal("1101", 2)
    13
    >>> en_decimal("FF", 16)
    255
    >>> en_decimal("2a", 16)
    42
    """
    valeur = 0
    for chiffre in ecriture:
        # Chaque nouveau chiffre décale les précédents d'un rang vers la gauche.
        valeur = valeur * base + CHIFFRES.index(chiffre.upper())
    return valeur


print(f"{'décimal':>8}  {'binaire':>10}  {'hexadécimal':>11}")
for n in [5, 13, 42, 100, 255]:
    print(f"{n:>8}  {en_base(n, 2):>10}  {en_base(n, 16):>11}")

print()
print("Python sait déjà le faire :")
print("  bin(42) =", bin(42), "   hex(255) =", hex(255))
print('  int("101010", 2) =', int("101010", 2), '   int("FF", 16) =', int("FF", 16))
print("Un octet va de 0 à", en_decimal("11111111", 2), "soit", en_base(255, 16), "en hexadécimal.")
