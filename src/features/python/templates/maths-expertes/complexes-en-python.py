# Modèle : Les complexes en Python
# Résumé : 3 + 4j : module, argument, forme exponentielle.

# Python note i avec un j collé au nombre : 3 + 4j, 1j. Le module cmath
# donne l'argument, la forme exponentielle et l'exponentielle complexe.
import cmath
import math


def forme_exponentielle(z):
    """Le module de z et son argument en degrés (dans ]−180 ; 180]), arrondis.

    >>> forme_exponentielle(1 + 1j)
    (1.4142, 45.0)
    >>> forme_exponentielle(-2)
    (2.0, 180.0)
    """
    r, theta = cmath.polar(z)
    return round(r, 4), round(math.degrees(theta), 4)


def rotation(z, angle):
    """L'image du point d'affixe z par la rotation de centre O et d'angle donné (en degrés).

    >>> rotation(3 + 4j, 90)
    (-4+3j)
    """
    w = z * cmath.exp(1j * math.radians(angle))
    return complex(round(w.real, 10), round(w.imag, 10))


z = 3 + 4j
w = 1 - 2j
print("z =", z, "  w =", w)
print("Re(z) =", z.real, "  Im(z) =", z.imag, "  conjugué :", z.conjugate())
print("z + w =", z + w, "  z × w =", z * w, "  z / w =", z / w)
print("|z| =", abs(z))

r, theta = cmath.polar(z)
print(f"arg(z) ≈ {theta:.4f} rad ≈ {math.degrees(theta):.2f}°")
print(f"Forme exponentielle : z ≈ {r} e^(i × {theta:.4f})")
w = cmath.rect(r, theta)
print("Retour à la forme algébrique :", w, "≈", complex(round(w.real, 10), round(w.imag, 10)))
print()

# Multiplier par e^(iθ), c'est tourner de θ autour de O.
print("z tourné de 90° :", rotation(z, 90))
print("i^2 =", 1j**2)

# L'identité d'Euler, aux erreurs d'arrondi près : e^(iπ) + 1 = 0.
print("e^(iπ) + 1 =", cmath.exp(1j * math.pi) + 1)
