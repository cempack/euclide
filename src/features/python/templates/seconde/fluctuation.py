# Modèle : Fluctuation d'échantillonnage
# Résumé : Des échantillons de taille n et l'intervalle p ± 1/√n.

# Un candidat obtient 40 % des voix (p = 0,4). On simule 100 sondages de n = 400 électeurs :
# dans combien de cas la fréquence observée f vérifie-t-elle |f − p| ≤ 1/√n ?
from math import sqrt
from random import random
import matplotlib.pyplot as plt

p = 0.4
n = 400
nombre_de_sondages = 100


def frequence_observee(p, n):
    """Renvoie la fréquence du caractère dans un échantillon aléatoire de taille n.

    >>> 0 <= frequence_observee(0.4, 100) <= 1
    True
    >>> frequence_observee(1, 50)
    1.0
    """
    compte = 0
    for _ in range(n):
        if random() < p:
            compte = compte + 1
    return compte / n


ecart = 1 / sqrt(n)
frequences = []
dedans = 0
for _ in range(nombre_de_sondages):
    f = frequence_observee(p, n)
    frequences.append(f)
    if abs(f - p) <= ecart:
        dedans = dedans + 1

print(f"Intervalle [p − 1/√n ; p + 1/√n] = [{p - ecart:.2f} ; {p + ecart:.2f}]")
print(f"{dedans} sondages sur {nombre_de_sondages} donnent une fréquence dans cet intervalle.")
print("En général, c'est le cas d'au moins 95 % des échantillons.")

plt.scatter(range(1, nombre_de_sondages + 1), frequences, label="fréquence observée")
plt.axhline(p, color="gray")
plt.axhline(p - ecart, color="red", linestyle="--")
plt.axhline(p + ecart, color="red", linestyle="--")
plt.ylim(0.25, 0.55)
plt.xlabel("Numéro du sondage")
plt.ylabel("Fréquence des votes pour le candidat")
plt.title(f"{nombre_de_sondages} sondages de {n} électeurs")
plt.legend()
plt.show()
