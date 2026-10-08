# Modèle : Fréquence des lettres
# Résumé : Compter les lettres d'un texte : le e en tête en français.

# On compte chaque lettre d'un poème de Victor Hugo, sans les accents (é compte
# comme e), puis on trace les fréquences. En français, le e arrive en tête.
import string
import unicodedata

import matplotlib.pyplot as plt

texte = """
Demain, dès l'aube, à l'heure où blanchit la campagne,
Je partirai. Vois-tu, je sais que tu m'attends.
J'irai par la forêt, j'irai par la montagne.
Je ne puis demeurer loin de toi plus longtemps.

Je marcherai les yeux fixés sur mes pensées,
Sans rien voir au dehors, sans entendre aucun bruit,
Seul, inconnu, le dos courbé, les mains croisées,
Triste, et le jour pour moi sera comme la nuit.

Je ne regarderai ni l'or du soir qui tombe,
Ni les voiles au loin descendant vers Harfleur,
Et quand j'arriverai, je mettrai sur ta tombe
Un bouquet de houx vert et de bruyère en fleur.
"""


def sans_accent(caractere):
    """Le caractère en minuscule, sans son accent.

    >>> sans_accent("É"), sans_accent("ç"), sans_accent("a")
    ('e', 'c', 'a')
    """
    return unicodedata.normalize("NFD", caractere.lower())[0]


def effectifs(texte):
    """Le nombre d'apparitions de chaque lettre de a à z, accents retirés.

    >>> effectifs("Été")["e"]
    2
    >>> effectifs("Où ?")["u"]
    1
    """
    compte = {lettre: 0 for lettre in string.ascii_lowercase}
    for caractere in texte:
        lettre = sans_accent(caractere)
        if lettre in compte:
            compte[lettre] = compte[lettre] + 1
    return compte


compte = effectifs(texte)
total = sum(compte.values())
frequences = [100 * compte[lettre] / total for lettre in string.ascii_lowercase]

print(f"{total} lettres. Les plus fréquentes :")
for lettre in sorted(compte, key=compte.get, reverse=True)[:6]:
    print(f"  {lettre} : {compte[lettre]:3} fois, soit {100 * compte[lettre] / total:.1f} %")

plt.figure(figsize=(9, 4))
plt.bar(list(string.ascii_lowercase), frequences)
plt.ylabel("fréquence (%)")
plt.title("Fréquence des lettres dans « Demain, dès l'aube… »")
plt.show()
