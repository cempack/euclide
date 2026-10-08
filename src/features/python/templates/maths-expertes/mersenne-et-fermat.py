# Modèle : Nombres de Mersenne et de Fermat
# Résumé : Lesquels sont premiers ?

# Mersenne : M_p = 2^p − 1 (p premier). Fermat : F_n = 2^(2^n) + 1.
# Fermat pensait tous les F_n premiers ; Euler a trouvé que 641 divise F_5.


def plus_petit_diviseur(n):
    """Le plus petit diviseur de n plus grand que 1 (n lui-même s'il est premier).

    >>> plus_petit_diviseur(2047)
    23
    >>> plus_petit_diviseur(4294967297)
    641
    >>> plus_petit_diviseur(127)
    127
    """
    d = 2
    while d * d <= n:
        if n % d == 0:
            return d
        d = d + 1
    return n


def lucas_lehmer(p):
    """Vrai si 2^p − 1 est premier (p premier impair), par le test de Lucas-Lehmer :
    s_0 = 4, s_(k+1) = s_k² − 2 modulo M_p, et M_p est premier si s_(p−2) = 0.

    >>> lucas_lehmer(7)
    True
    >>> lucas_lehmer(11)
    False
    """
    m = 2**p - 1
    s = 4
    for _ in range(p - 2):
        s = (s * s - 2) % m
    return s == 0


print("Nombres de Mersenne M_p = 2^p − 1 :")
for p in [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31]:
    m = 2**p - 1
    d = plus_petit_diviseur(m)
    if d == m:
        print(f"  M_{p} = {m} est premier")
    else:
        print(f"  M_{p} = {m} = {d} × {m // d}")

# Les divisions deviennent trop longues : Lucas-Lehmer va beaucoup plus loin.
exposants = [p for p in range(3, 700) if plus_petit_diviseur(p) == p and lucas_lehmer(p)]
print("p impairs < 700 pour lesquels M_p est premier :", exposants)
print()

print("Nombres de Fermat F_n = 2^(2^n) + 1 :")
for n in range(6):
    f = 2 ** (2**n) + 1
    d = plus_petit_diviseur(f)
    if d == f:
        print(f"  F_{n} = {f} est premier")
    else:
        print(f"  F_{n} = {f} = {d} × {f // d}")
