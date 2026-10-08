# Modèle : Tours de Hanoï
# Résumé : Déplacer n disques en 2ⁿ − 1 coups.

# Pour déplacer n disques de A vers C : on déplace les n − 1 du dessus de A
# vers B, le plus grand de A vers C, puis les n − 1 de B vers C.


def hanoi(n, depart, arrivee, intermediaire):
    """La liste des déplacements (disque, de, vers) qui amènent n disques de depart à arrivee.

    >>> hanoi(1, "A", "C", "B")
    [(1, 'A', 'C')]
    >>> hanoi(2, "A", "C", "B")
    [(1, 'A', 'B'), (2, 'A', 'C'), (1, 'B', 'C')]
    >>> len(hanoi(10, "A", "C", "B"))
    1023
    """
    if n == 0:
        return []
    return (
        hanoi(n - 1, depart, intermediaire, arrivee)
        + [(n, depart, arrivee)]
        + hanoi(n - 1, intermediaire, arrivee, depart)
    )


print("Trois disques, de A vers C :")
for disque, de, vers in hanoi(3, "A", "C", "B"):
    print(f"  disque {disque} : {de} → {vers}")

print()
for n in range(1, 11):
    coups = len(hanoi(n, "A", "C", "B"))
    disques = f"{n} disque" + ("s" if n > 1 else "")
    deplacements = f"{coups} déplacement" + ("s" if coups > 1 else "")
    print(f"{disques:>10} : {deplacements:>17}   (2^{n} − 1 = {2**n - 1})")

# La légende : 64 disques, un déplacement par seconde.
secondes = 2**64 - 1
annees = secondes / (365.25 * 24 * 3600)
print()
print(f"64 disques : {secondes:_} déplacements, soit {annees / 1e9:.0f} milliards d'années.")
