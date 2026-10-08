# Modèle : Diagramme en barres
# Résumé : Des catégories et leurs effectifs.

# Le moyen de transport des élèves de seconde, en effectifs et en fréquences.
import matplotlib.pyplot as plt

transports = {"À pied": 18, "Vélo": 12, "Bus": 41, "Voiture": 27, "Train": 14}
total = sum(transports.values())

for moyen, effectif in transports.items():
    print(f"{moyen:<8} {effectif:>3} élèves   {effectif / total:6.1%}")
print(f"{'Total':<8} {total:>3} élèves")

plt.bar(list(transports), list(transports.values()), color="#0F4FA8")
plt.ylabel("Nombre d'élèves")
plt.title(f"Moyen de transport des {total} élèves de seconde")
plt.grid(True)
plt.show()
