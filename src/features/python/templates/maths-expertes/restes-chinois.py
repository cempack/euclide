# Modèle : Restes chinois
# Résumé : Résoudre x ≡ a (mod m) et x ≡ b (mod n).

# Si m et n sont premiers entre eux, Bézout donne m × u + n × v = 1, et
# x = a × n × v + b × m × u convient : la solution est unique modulo m × n.


def bezout(a, b):
    """Un triplet (d, u, v) avec d = PGCD(a, b) et a × u + b × v = d.

    >>> bezout(17, 11)
    (1, 2, -3)
    """
    u0, v0, u1, v1 = 1, 0, 0, 1
    while b != 0:
        q = a // b
        a, b = b, a - q * b
        u0, u1 = u1, u0 - q * u1
        v0, v1 = v1, v0 - q * v1
    return a, u0, v0


def restes_chinois(a, m, b, n):
    """Le couple (x, m × n) où x ≡ a (mod m), x ≡ b (mod n) et 0 ≤ x < m × n.

    >>> restes_chinois(3, 17, 4, 11)
    (37, 187)
    >>> restes_chinois(37, 187, 5, 6)
    (785, 1122)
    """
    d, u, v = bezout(m, n)
    if d != 1:
        raise ValueError(f"{m} et {n} ne sont pas premiers entre eux")
    return (a * n * v + b * m * u) % (m * n), m * n


# Le problème des pirates : 17 pirates se partagent un trésor de pièces d'or,
# il reste 3 pièces pour le cuisinier. Six pirates meurent : à 11, il en
# resterait 4. Après un naufrage, à 6, il en resterait 5. Combien de pièces ?
x, module = restes_chinois(3, 17, 4, 11)
print(f"x ≡ 3 (mod 17) et x ≡ 4 (mod 11)  ⟺  x ≡ {x} (mod {module})")
x, module = restes_chinois(x, module, 5, 6)
print(f"et x ≡ 5 (mod 6)                  ⟺  x ≡ {x} (mod {module})")
print(f"Le trésor compte au moins {x} pièces.")

# Vérification en essayant tous les nombres un par un.
solution = min(t for t in range(1, 2000) if t % 17 == 3 and t % 11 == 4 and t % 6 == 5)
print("En essayant tous les nombres :", solution)
