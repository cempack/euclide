# Modèle : Lire un fichier CSV
# Résumé : Une table d'élèves, en liste de dictionnaires.

# Une table : chaque ligne est un enregistrement, chaque colonne un descripteur.
# Ici, le fichier est écrit dans le script ; pour lire un vrai fichier
# eleves.csv rangé à côté du script :
#     with open("eleves.csv", encoding="utf-8") as fichier:
#         table = charger(fichier)
import csv
import io

TEXTE = """nom;prenom;classe;moyenne
Martin;Léa;1G1;14.5
Bernard;Hugo;1G2;11
Dubois;Inès;1G1;16.25
Petit;Noah;1G2;9.5
Durand;Jade;1G1;12
"""


def charger(fichier):
    """La table du fichier CSV (séparateur « ; »), avec les moyennes en nombres.

    >>> charger(io.StringIO("nom;moyenne\\nLéa;15\\n"))
    [{'nom': 'Léa', 'moyenne': 15.0}]
    >>> len(charger(io.StringIO(TEXTE)))
    5
    """
    table = []
    for ligne in csv.DictReader(fichier, delimiter=";"):
        # Le module csv lit du texte : on convertit ce qui est un nombre.
        ligne["moyenne"] = float(ligne["moyenne"])
        table.append(ligne)
    return table


table = charger(io.StringIO(TEXTE))
print(len(table), "élèves ; descripteurs :", list(table[0].keys()))
print("Première ligne :", table[0])
print()
for eleve in table:
    print(f"  {eleve['prenom']:<6} {eleve['nom']:<8} {eleve['classe']}  {eleve['moyenne']:>5}")
moyenne = sum(eleve["moyenne"] for eleve in table) / len(table)
print(f"Moyenne des élèves : {moyenne:.2f}")
