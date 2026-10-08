# Modèle : Termes et somme
# Résumé : Les premiers termes d'une suite et leur somme.

# Suite arithmétique u_n = 5 + 3n et suite géométrique v_n = 2 × 1,5^n :
# leurs termes par la formule ou par récurrence, et la somme des premiers termes.


def u(n):
    """u_n = 5 + 3n : premier terme 5, raison 3.

    >>> u(0), u(1), u(10)
    (5, 8, 35)
    """
    return 5 + 3 * n


def v(n):
    """v_n = 2 × 1,5^n : premier terme 2, raison 1,5.

    >>> v(0), v(1), v(2)
    (2.0, 3.0, 4.5)
    """
    return 2 * 1.5**n


def somme_u(N):
    """u_0 + u_1 + … + u_(N−1).

    >>> somme_u(1)
    5
    >>> somme_u(10)
    185
    """
    total = 0
    for n in range(N):
        total = total + u(n)
    return total


def somme_v(N):
    """v_0 + v_1 + … + v_(N−1).

    >>> somme_v(3)
    9.5
    """
    total = 0
    for n in range(N):
        total = total + v(n)
    return total


N = 10
print("u_n par la formule :", [u(n) for n in range(N)])

# Par récurrence : chaque terme se calcule à partir du précédent.
termes = [5]
for _ in range(N - 1):
    termes.append(termes[-1] + 3)
print("u_n par récurrence :", termes)

print("v_n par la formule :", [round(v(n), 2) for n in range(N)])
termes = [2.0]
for _ in range(N - 1):
    termes.append(termes[-1] * 1.5)
print("v_n par récurrence :", [round(x, 2) for x in termes])

# Les sommes, comparées aux formules du cours.
print()
print(f"u_0 + … + u_{N - 1} = {somme_u(N)}")
print(f"N × (u_0 + u_{N - 1}) / 2 = {N * (u(0) + u(N - 1)) // 2}")
print(f"v_0 + … + v_{N - 1} = {somme_v(N):.4f}")
print(f"v_0 × (1 − 1,5^{N}) / (1 − 1,5) = {v(0) * (1 - 1.5**N) / (1 - 1.5):.4f}")
