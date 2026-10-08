# Demander des valeurs, calculer, afficher le résultat.

prix_ht = float(input("Prix hors taxes (€) : "))
taux = float(input("Taux de TVA (%) : "))

prix_ttc = prix_ht * (1 + taux / 100)
print(f"Prix TTC : {prix_ttc:.2f} €")
