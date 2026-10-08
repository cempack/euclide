# Modèle : Euclide et Bézout
# Résumé : Le PGCD, puis u et v tels que au + bv = PGCD(a, b).

# Algorithme d'Euclide : PGCD(a, b) = PGCD(b, r), où r est le reste de a par b.
# En gardant la trace des quotients, on obtient aussi u et v (Bézout).


def afficher_divisions(a, b):
    """Affiche les divisions euclidiennes successives de l'algorithme.

    >>> afficher_divisions(252, 198)
    252 = 198 × 1 + 54
    198 = 54 × 3 + 36
    54 = 36 × 1 + 18
    36 = 18 × 2 + 0
    """
    while b != 0:
        q, r = divmod(a, b)
        print(f"{a} = {b} × {q} + {r}")
        a, b = b, r


def pgcd(a, b):
    """Le PGCD de a et b, par l'algorithme d'Euclide.

    >>> pgcd(252, 198)
    18
    >>> pgcd(17, 5)
    1
    >>> pgcd(12, 0)
    12
    """
    while b != 0:
        a, b = b, a % b
    return a


def bezout(a, b):
    """Un triplet (d, u, v) avec d = PGCD(a, b) et a × u + b × v = d.

    >>> bezout(252, 198)
    (18, 4, -5)
    >>> d, u, v = bezout(17, 5)
    >>> 17 * u + 5 * v
    1
    """
    # À chaque étape, a = a0 × u0 + b0 × v0 et b = a0 × u1 + b0 × v1.
    u0, v0, u1, v1 = 1, 0, 0, 1
    while b != 0:
        q = a // b
        a, b = b, a - q * b
        u0, u1 = u1, u0 - q * u1
        v0, v1 = v1, v0 - q * v1
    return a, u0, v0


def entre_parentheses(n):
    """n tel qu'on l'écrit après un signe × : entre parenthèses s'il est négatif.

    >>> entre_parentheses(-5), entre_parentheses(4)
    ('(-5)', '4')
    """
    return f"({n})" if n < 0 else str(n)


a, b = 252, 198
afficher_divisions(a, b)
d, u, v = bezout(a, b)
print(f"PGCD({a}, {b}) = {d}")
print(f"Bézout : {a} × {entre_parentheses(u)} + {b} × {entre_parentheses(v)} = {a * u + b * v}")
print()

# Deux nombres premiers entre eux : u est l'inverse de a modulo b.
a, b = 17, 5
d, u, v = bezout(a, b)
print(f"{a} × {entre_parentheses(u)} + {b} × {entre_parentheses(v)} = {d}")
print(f"Donc {b} × {v} ≡ 1 (mod {a}) : l'inverse de {b} modulo {a} est {v % a}.")
print("Vérification avec pow :", pow(b, -1, a))
