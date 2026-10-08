# Lancer un dé N fois : les fréquences se rapprochent de 1/6.
from random import randint
import matplotlib.pyplot as plt

N = 1000
effectifs = [0] * 6
for _ in range(N):
    effectifs[randint(1, 6) - 1] += 1

frequences = [e / N for e in effectifs]
for face, freq in enumerate(frequences, start=1):
    print(f"Face {face} : {freq:.3f}")

plt.bar([1, 2, 3, 4, 5, 6], frequences)
plt.axhline(1 / 6, color="red")
plt.title(f"{N} lancers d'un dé")
plt.show()
