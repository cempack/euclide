# Modèle : Créer une liste
# Résumé : En extension, par ajouts successifs, en compréhension.

# Trois façons d'obtenir la liste des carrés des entiers de 0 à 9,
# puis comment lire et modifier une liste.

# 1. En extension : on écrit tous les éléments.
carres = [0, 1, 4, 9, 16, 25, 36, 49, 64, 81]
print("En extension     :", carres)

# 2. Par ajouts successifs : on part d'une liste vide.
carres = []
for k in range(10):
    carres.append(k**2)
print("Par ajouts       :", carres)

# 3. En compréhension : « la liste des k² pour k allant de 0 à 9 ».
carres = [k**2 for k in range(10)]
print("En compréhension :", carres)

# Une condition ne garde que certains éléments : les carrés des impairs.
print("Carrés impairs   :", [k**2 for k in range(10) if k % 2 == 1])

# Les premiers termes d'une suite : u_n = 3n + 2 pour n de 0 à 9.
u = [3 * n + 2 for n in range(10)]
print("u_n = 3n + 2     :", u)

print()
print("Premier terme u[0] :", u[0], "  dernier terme u[-1] :", u[-1])
print("De u[2] à u[4]     :", u[2:5])
print("Longueur :", len(u), "  somme :", sum(u), "  maximum :", max(u))
print("20 est-il dans la liste ?", 20 in u)
u.append(32)
print("Après u.append(32) :", u)
u.remove(2)
print("Après u.remove(2)  :", u)
