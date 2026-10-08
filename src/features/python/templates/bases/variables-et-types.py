# Modèle : Variables et types
# Résumé : Entiers, flottants, chaînes, booléens : affecter, convertir.

# Une variable porte un nom et une valeur ; la valeur a un type.

age = 16  # un entier : int
taille = 1.72  # un flottant : float, avec un point
prenom = "Léa"  # une chaîne de caractères : str
majeur = age >= 18  # un booléen : bool, True ou False

print(type(age), type(taille), type(prenom), type(majeur))
print(f"{prenom} a {age} ans et mesure {taille} m.")
print("Au moins 18 ans ?", majeur)

# Convertir d'un type à l'autre.
texte = "12"
nombre = int(texte)
print("Deux chaînes se mettent bout à bout :", texte + texte)
print("Deux entiers s'additionnent :", nombre + nombre)
print("En flottant :", float(nombre), "— en chaîne :", str(taille) + " m")

# Les opérations sur les nombres.
print("17 / 5 =", 17 / 5, "(division décimale)")
print("17 // 5 =", 17 // 5, "(quotient entier)")
print("17 % 5 =", 17 % 5, "(reste)")
print("2 ** 10 =", 2**10, "(puissance)")
