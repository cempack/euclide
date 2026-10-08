# Modèle : Recherche textuelle
# Résumé : Boyer-Moore-Horspool : sauter les positions inutiles.

# Chercher un motif dans un texte. La méthode naïve essaie chaque position ;
# celle de Horspool compare le motif de droite à gauche et, d'après la
# lettre du texte sous la fin du motif, saute les positions impossibles.

TEXTE = """Demain, dès l'aube, à l'heure où blanchit la campagne,
Je partirai. Vois-tu, je sais que tu m'attends.
J'irai par la forêt, j'irai par la montagne.
Je ne puis demeurer loin de toi plus longtemps.

Je marcherai les yeux fixés sur mes pensées,
Sans rien voir au dehors, sans entendre aucun bruit,
Seul, inconnu, le dos courbé, les mains croisées,
Triste, et le jour pour moi sera comme la nuit.

Je ne regarderai ni l'or du soir qui tombe,
Ni les voiles au loin descendant vers Harfleur,
Et quand j'arriverai, je mettrai sur ta tombe
Un bouquet de houx vert et de bruyère en fleur."""


def recherche_naive(texte, motif):
    """Les positions du motif dans le texte, et le nombre de comparaisons de lettres faites.

    >>> recherche_naive("abracadabra", "abra")[0]
    [0, 7]
    >>> recherche_naive("abc", "d")
    ([], 3)
    """
    positions, comparaisons = [], 0
    for i in range(len(texte) - len(motif) + 1):
        j = 0
        while j < len(motif):
            comparaisons = comparaisons + 1
            if texte[i + j] != motif[j]:
                break
            j = j + 1
        if j == len(motif):
            positions.append(i)
    return positions, comparaisons


def table_des_decalages(motif):
    """Pour chaque lettre du motif, sauf la dernière : la distance qui la sépare de la fin.

    >>> table_des_decalages("abra")
    {'a': 3, 'b': 2, 'r': 1}
    >>> table_des_decalages("a")
    {}
    """
    decalages = {}
    for i in range(len(motif) - 1):
        decalages[motif[i]] = len(motif) - 1 - i
    return decalages


def recherche_horspool(texte, motif):
    """Les positions du motif dans le texte, et le nombre de comparaisons de lettres faites.

    >>> recherche_horspool("abracadabra", "abra")[0]
    [0, 7]
    >>> recherche_horspool("aaaa", "aa")[0]
    [0, 1, 2]
    """
    assert len(motif) > 0, "motif vide"
    m = len(motif)
    decalages = table_des_decalages(motif)
    positions, comparaisons = [], 0
    i = 0
    while i <= len(texte) - m:
        j = m - 1
        while j >= 0:
            comparaisons = comparaisons + 1
            if texte[i + j] != motif[j]:
                break
            j = j - 1
        if j < 0:
            positions.append(i)
        # Une lettre absente du motif permet de sauter toute sa longueur.
        i = i + decalages.get(texte[i + m - 1], m)
    return positions, comparaisons


print(f"Le texte : « Demain, dès l'aube… » de Victor Hugo, {len(TEXTE)} caractères.")
for motif in ["tombe", "j'irai", "bruyère en fleur"]:
    positions, naive = recherche_naive(TEXTE, motif)
    _, horspool = recherche_horspool(TEXTE, motif)
    print()
    print(f"« {motif} » : aux positions {positions}")
    print(f"  {naive} comparaisons en naïf, {horspool} avec Horspool")
