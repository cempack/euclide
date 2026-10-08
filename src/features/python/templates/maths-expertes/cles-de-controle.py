# Modèle : Clés de contrôle
# Résumé : Code-barres EAN-13, ISBN-10, clé du numéro Insee.

# La clé se calcule à partir des autres chiffres : une faute de frappe
# la rend fausse, et l'erreur est détectée.


def cle_ean13(debut):
    """Le 13e chiffre d'un code-barres EAN-13, à partir des 12 premiers :
    poids 1, 3, 1, 3… et la somme doit tomber sur un multiple de 10.

    >>> cle_ean13("301762042200")
    3
    >>> cle_ean13("978207036822")
    8
    """
    somme = 0
    for i, chiffre in enumerate(debut):
        poids = 1 if i % 2 == 0 else 3
        somme = somme + poids * int(chiffre)
    return (10 - somme % 10) % 10


def ean13_valide(code):
    """Vrai si le dernier chiffre du code est la bonne clé.

    >>> ean13_valide("3017620422003"), ean13_valide("3017620422103")
    (True, False)
    """
    return cle_ean13(code[:12]) == int(code[12])


def cle_isbn10(debut):
    """Le 10e caractère d'un ISBN-10 à partir des 9 premiers chiffres :
    poids 10, 9, …, 2, et la somme avec la clé doit être un multiple de 11
    (X pour une clé de 10).

    >>> cle_isbn10("207036822")
    'X'
    >>> cle_isbn10("207040850")
    '7'
    """
    somme = 0
    for i, chiffre in enumerate(debut):
        somme = somme + (10 - i) * int(chiffre)
    cle = (11 - somme % 11) % 11
    return "X" if cle == 10 else str(cle)


def cle_insee(numero):
    """La clé d'un numéro Insee (13 caractères) : 97 − (numéro modulo 97).
    Pour la Corse, 2A compte pour 19 et 2B pour 18.

    >>> cle_insee("1841276451089")
    46
    >>> cle_insee("290032A004012")
    34
    """
    numero = numero.replace("2A", "19").replace("2B", "18")
    return 97 - int(numero) % 97


for code in ["3017620422003", "3017620422103"]:  # le second : un 0 tapé 1
    print(f"EAN-13 {code} :", "valide" if ean13_valide(code) else "erreur détectée")
print("ISBN 2-07-036822-? : la clé est", cle_isbn10("207036822"))
print("Son ISBN-13 : 978-2-07-036822 suivi de la clé EAN", cle_ean13("978207036822"))
print("Numéro Insee 1 84 12 76 451 089 : clé", cle_insee("1841276451089"))
print()

# Toutes les fautes possibles sur un seul chiffre du code-barres.
code = "3017620422003"
fautes = detectees = 0
for i in range(13):
    for chiffre in "0123456789":
        if chiffre != code[i]:
            fautes = fautes + 1
            if not ean13_valide(code[:i] + chiffre + code[i + 1 :]):
                detectees = detectees + 1
print(f"Un chiffre faux : {detectees} erreurs détectées sur {fautes}.")

# À chercher : quels échanges de deux chiffres voisins l'EAN-13 ne détecte-t-il pas ?
