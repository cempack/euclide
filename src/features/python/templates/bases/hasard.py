# Modèle : Le hasard avec random
# Résumé : randint, random, choice, shuffle, sample.

# Le module random : un nouveau tirage à chaque exécution.
from random import choice, randint, random, sample, shuffle

print("Un lancer de dé :", randint(1, 6))  # un entier de 1 à 6, bornes comprises
print("Un réel de [0 ; 1[ :", random())
print("Pile ou face :", choice(["pile", "face"]))

eleves = ["Adam", "Chloé", "Hugo", "Inès", "Léo", "Manon"]
print("Au tableau :", choice(eleves))
print("Trois rapporteurs :", sample(eleves, 3))  # trois noms différents
shuffle(eleves)  # mélange la liste elle-même
print("Ordre de passage :", eleves)

# Dix lancers de dé : combien de 6 ?
nombre_de_six = 0
for _ in range(10):
    de = randint(1, 6)
    print(de, end=" ")
    if de == 6:
        nombre_de_six = nombre_de_six + 1
print(f"→ {nombre_de_six} fois le 6")
