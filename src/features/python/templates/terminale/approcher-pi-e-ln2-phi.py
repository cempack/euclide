# Modèle : Approcher π, e, ln 2 et φ
# Résumé : Des suites et des sommes, comparées aux valeurs exactes.
# Script : Approcher pi e ln 2 et phi

# Quatre constantes, quatre suites qui convergent vers elles :
# π = 4 × (1 − 1/3 + 1/5 − …)        e = 1 + 1/1! + 1/2! + 1/3! + …
# ln 2 = 1 − 1/2 + 1/3 − 1/4 + …     φ : u_0 = 1 et u_(n+1) = 1 + 1 / u_n
from math import e, log, pi, sqrt


def pi_leibniz(n):
    """4 × (1 − 1/3 + 1/5 − …), avec n termes.

    >>> pi_leibniz(1)
    4.0
    >>> round(pi_leibniz(1000), 3)
    3.141
    """
    return 4 * sum((-1) ** k / (2 * k + 1) for k in range(n))


def e_factorielles(n):
    """1 + 1/1! + 1/2! + … + 1/n!.

    >>> e_factorielles(1)
    2.0
    >>> round(e_factorielles(10), 6)
    2.718282
    """
    terme, somme = 1.0, 1.0
    for k in range(1, n + 1):
        terme = terme / k
        somme = somme + terme
    return somme


def ln2_alternee(n):
    """1 − 1/2 + 1/3 − 1/4 + …, avec n termes.

    >>> ln2_alternee(2)
    0.5
    >>> round(ln2_alternee(1000), 3)
    0.693
    """
    return sum((-1) ** (k + 1) / k for k in range(1, n + 1))


def phi_suite(n):
    """Le terme u_n de la suite u_0 = 1, u_(n+1) = 1 + 1 / u_n.

    >>> phi_suite(1)
    2.0
    >>> round(phi_suite(30), 6)
    1.618034
    """
    u = 1.0
    for _ in range(n):
        u = 1 + 1 / u
    return u


def comparer(nom, suite, valeur):
    """Affiche les valeurs approchées pour quelques n, et leur écart à la valeur."""
    print(f"{nom} = {valeur:.12f}")
    for n in (5, 10, 100, 1000):
        approche = suite(n)
        print(f"   n = {n:4} : {approche:.12f}   écart {abs(approche - valeur):.1e}")
    print()


comparer("π", pi_leibniz, pi)
comparer("e", e_factorielles, e)
comparer("ln 2", ln2_alternee, log(2))
comparer("φ", phi_suite, (1 + sqrt(5)) / 2)
print("e et φ sont vite atteints ; les sommes alternées de π et ln 2 avancent lentement.")
