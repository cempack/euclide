# Modèle : Boucle while
# Résumé : Répéter tant qu'une condition est vraie.

# 1 000 € placés à 3 % par an : au bout de combien d'années le capital a-t-il doublé ?
# On ne connaît pas le nombre de tours à l'avance : c'est le travail de while.

capital = 1000
annee = 0
while capital < 2000:
    capital = capital * 1.03
    annee = annee + 1
    print(f"Année {annee:>2} : {capital:.2f} €")

print(f"Le capital a doublé au bout de {annee} ans.")

# Si la condition reste vraie pour toujours, la boucle ne s'arrête jamais :
# le bouton « Arrêter » interrompt alors le script.
