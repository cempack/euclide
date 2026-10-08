# Modèle : PageRank
# Résumé : Classer des pages web par une marche aléatoire.

# Un internaute suit un lien au hasard (probabilité d = 0,85) ou saute sur une
# page au hasard. Le score d'une page est la probabilité, à long terme, d'y être :
# on l'obtient en répétant score ← (1 − d)/N + d × (ce que lui apportent ses liens).
from random import choice, random
import matplotlib.pyplot as plt

LIENS = {
    "Accueil": ["Cours", "Exercices", "Contact"],
    "Cours": ["Accueil", "Exercices"],
    "Exercices": ["Cours", "Corrigés"],
    "Corrigés": ["Exercices"],
    "Contact": ["Accueil"],
}


def pagerank(liens, d=0.85, etapes=100):
    """Le score de chaque page, calculé en répétant la formule.

    >>> {p: round(s, 6) for p, s in pagerank({"A": ["B"], "B": ["A"]}).items()}
    {'A': 0.5, 'B': 0.5}
    >>> round(sum(pagerank(LIENS).values()), 6)
    1.0
    """
    pages = list(liens)
    n = len(pages)
    score = {p: 1 / n for p in pages}
    for _ in range(etapes):
        nouveau = {p: (1 - d) / n for p in pages}
        for p in pages:
            for q in liens[p]:
                nouveau[q] = nouveau[q] + d * score[p] / len(liens[p])
        score = nouveau
    return score


def internaute(liens, n, d=0.85):
    """La fréquence de passage sur chaque page, en simulant n clics.

    >>> round(sum(internaute(LIENS, 100).values()), 6)
    1.0
    """
    pages = list(liens)
    visites = {p: 0 for p in pages}
    page = choice(pages)
    for _ in range(n):
        page = choice(liens[page]) if random() < d else choice(pages)
        visites[page] = visites[page] + 1
    return {p: k / n for p, k in visites.items()}


score = pagerank(LIENS)
simule = internaute(LIENS, 20_000)
classement = sorted(score, key=score.get, reverse=True)
print(f"{'page':<10} {'PageRank':>9} {'internaute':>11}")
for p in classement:
    print(f"{p:<10} {score[p]:>9.4f} {simule[p]:>11.4f}")

plt.bar(classement, [score[p] for p in classement])
plt.ylabel("score")
plt.title("PageRank des pages du site")
plt.show()
