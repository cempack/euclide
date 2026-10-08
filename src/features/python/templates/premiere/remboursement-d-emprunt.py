# Modèle : Remboursement d'un emprunt
# Résumé : Le capital restant dû, mois après mois.

# On emprunte 10 000 € au taux annuel de 3 %, soit 0,25 % par mois, et on
# rembourse 200 € par mois. Chaque mois : C_(n+1) = 1,0025 × C_n − 200.
# Combien de mois pour tout rembourser, et combien coûtent les intérêts ?
import matplotlib.pyplot as plt


def mois_suivant(capital, taux_mensuel, mensualite):
    """Le capital restant dû un mois plus tard.

    >>> round(mois_suivant(10000, 0.0025, 200), 2)
    9825.0
    >>> round(mois_suivant(9825, 0.0025, 200), 2)
    9649.56
    """
    return capital * (1 + taux_mensuel) - mensualite


capital = 10000
taux_mensuel = 0.03 / 12
mensualite = 200

mois = 0
total_paye = 0
restes = [capital]
while capital > 0:
    # La dernière mensualité ne rembourse que ce qui reste dû.
    paiement = min(mensualite, capital * (1 + taux_mensuel))
    capital = mois_suivant(capital, taux_mensuel, paiement)
    total_paye = total_paye + paiement
    mois = mois + 1
    restes.append(capital)
    if mois % 6 == 0:
        print(f"Après {mois:2} mois : il reste {capital:8.2f} €")

print()
print(f"Remboursé en {mois} mois ({mois // 12} ans et {mois % 12} mois).")
print(f"Total payé : {total_paye:.2f} €, dont {total_paye - 10000:.2f} € d'intérêts.")

plt.plot(list(range(len(restes))), restes)
plt.xlabel("mois")
plt.ylabel("capital restant dû (€)")
plt.title("Remboursement de 10 000 € à 3 %, 200 € par mois")
plt.grid(True)
plt.show()
