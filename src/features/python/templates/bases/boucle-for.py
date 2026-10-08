# Modèle : Boucle for
# Résumé : range(), compter, additionner : la somme des entiers.

# Une boucle for répète un bloc pour chaque valeur d'une séquence.

# La table de 7 : i prend les valeurs 1, 2, …, 10 (range(1, 11) s'arrête avant 11).
for i in range(1, 11):
    print(f"7 × {i} = {7 * i}")

# Additionner : la somme 1 + 2 + … + 100 dans une variable qui accumule.
somme = 0
for k in range(1, 101):
    somme = somme + k
print("1 + 2 + … + 100 =", somme)

# Compter : combien d'entiers de 1 à 100 sont divisibles par 3 ou par 7 ?
compteur = 0
for n in range(1, 101):
    if n % 3 == 0 or n % 7 == 0:
        compteur = compteur + 1
print(compteur, "entiers de 1 à 100 sont divisibles par 3 ou par 7")

# range(début, fin, pas) : de 0 à 50, de 5 en 5.
for n in range(0, 51, 5):
    print(n, end=" ")
print()
