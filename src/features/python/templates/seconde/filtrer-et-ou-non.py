# Modèle : Filtrer avec et, ou, non
# Résumé : Sélectionner des élèves selon plusieurs critères.

# Chaque élève est décrit par son nom, sa classe, sa moyenne et s'il est
# demi-pensionnaire. On sélectionne ceux qui vérifient une condition.

eleves = [
    ("Alice", "2nde A", 14.5, True),
    ("Bilal", "2nde B", 9.0, False),
    ("Chloé", "2nde A", 11.0, False),
    ("David", "2nde B", 16.0, True),
    ("Emma", "2nde A", 8.5, True),
    ("Farid", "2nde B", 12.5, False),
    ("Gaëlle", "2nde A", 17.0, False),
    ("Hugo", "2nde B", 10.0, True),
]

print("Moyenne d'au moins 12 ET demi-pensionnaire :")
# « _ » tient la place d'une information dont ce test ne se sert pas.
for nom, _, moyenne, demi_pension in eleves:
    if moyenne >= 12 and demi_pension:
        print("   ", nom)

print("En 2nde A OU moyenne sous 10 :")
for nom, classe, moyenne, _ in eleves:
    if classe == "2nde A" or moyenne < 10:
        print("   ", nom)

print("NON demi-pensionnaire :")
for nom, _, _, demi_pension in eleves:
    if not demi_pension:
        print("   ", nom)

print("Moyenne entre 10 et 15, en 2nde B :")
for nom, classe, moyenne, _ in eleves:
    if 10 <= moyenne <= 15 and classe == "2nde B":
        print("   ", nom)
print()

# NON (A ET B) a la même valeur que (NON A) OU (NON B), pour chaque élève.
toujours_pareil = True
for _, _, moyenne, demi_pension in eleves:
    a = moyenne >= 12
    b = demi_pension
    if (not (a and b)) != ((not a) or (not b)):
        toujours_pareil = False
print("NON (A ET B) = (NON A) OU (NON B) pour tous les élèves :", toujours_pareil)
