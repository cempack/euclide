# Modèle : Encodage du texte
# Résumé : ASCII, Unicode, UTF-8 : les octets d'un mot.

# Chaque caractère a un numéro Unicode (son point de code). UTF-8 l'écrit
# sur 1 à 4 octets, et sur un seul pour les caractères de l'ASCII.


def octets_utf8(texte):
    """Les octets du texte encodé en UTF-8, en hexadécimal.

    >>> octets_utf8("A")
    '41'
    >>> octets_utf8("é")
    'C3 A9'
    >>> octets_utf8("€")
    'E2 82 AC'
    """
    return " ".join(f"{octet:02X}" for octet in texte.encode("utf-8"))


print("Caractère   Unicode    UTF-8")
for caractere in ["A", "a", "0", " ", "é", "€", "π", "😀"]:
    point_de_code = f"U+{ord(caractere):04X}"
    print(f"  {caractere!r:<9} {point_de_code:<10} {octets_utf8(caractere)}")

mot = "été"
octets = mot.encode("utf-8")
print()
print(f"« {mot} » : {len(mot)} caractères, {len(octets)} octets en UTF-8 :", list(octets))
print("ord('é') =", ord("é"), "   chr(233) =", chr(233))

# Un texte UTF-8 lu avec un autre encodage devient illisible :
print("Ses octets lus en Latin-1 :", octets.decode("latin-1"))
