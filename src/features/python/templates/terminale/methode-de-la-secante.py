# Modèle : Méthode de la sécante
# Résumé : Comme Newton, mais sans la dérivée.

# Résoudre f(x) = 0. Newton suit la tangente ; la sécante suit la droite qui
# passe par les deux derniers points :
# x_(n+1) = x_n − f(x_n) × (x_n − x_(n−1)) / (f(x_n) − f(x_(n−1))).


def f(x):
    return x**3 - 2 * x - 5


def derivee(x):
    return 3 * x**2 - 2


def secante(f, a, b, precision=1e-12):
    """Les valeurs successives de la méthode de la sécante, depuis a et b,
    jusqu'à deux valeurs distantes de moins de precision.

    >>> valeurs = secante(lambda x: x**2 - 2, 1, 2)
    >>> round(valeurs[-1], 10)
    1.4142135624
    >>> secante(lambda x: 2 * x - 6, 0, 1)
    [0, 1, 3.0, 3.0]
    """
    valeurs = [a, b]
    while abs(valeurs[-1] - valeurs[-2]) > precision and len(valeurs) < 100:
        a, b = valeurs[-2], valeurs[-1]
        if f(b) == f(a):
            break
        valeurs.append(b - f(b) * (b - a) / (f(b) - f(a)))
    return valeurs


def newton(f, derivee, x, precision=1e-12):
    """Les valeurs successives de la méthode de Newton, depuis x.

    >>> round(newton(lambda x: x**2 - 2, lambda x: 2 * x, 1)[-1], 10)
    1.4142135624
    """
    valeurs = [x]
    while len(valeurs) < 100:
        x = x - f(x) / derivee(x)
        valeurs.append(x)
        if abs(valeurs[-1] - valeurs[-2]) <= precision:
            break
    return valeurs


print("x³ − 2x − 5 = 0, l'équation sur laquelle Newton a présenté sa méthode.")
print()
print("Sécante, depuis 2 et 3 :")
for n, x in enumerate(secante(f, 2, 3)):
    print(f"   x_{n} = {x:.15f}")
print()
print("Newton, depuis 3 :")
for n, x in enumerate(newton(f, derivee, 3)):
    print(f"   x_{n} = {x:.15f}")
print()
print("Newton va un peu plus vite, mais il lui faut la dérivée ; la sécante n'utilise que f.")
