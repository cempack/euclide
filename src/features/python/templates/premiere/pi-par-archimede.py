# Modèle : π par Archimède
# Résumé : Polygones inscrits et circonscrits, côtés doublés.

# Un cercle de diamètre 1 a pour périmètre π. On l'encadre par les périmètres
# des polygones réguliers inscrit et circonscrit, en doublant le nombre de côtés
# à chaque étape, de 6 à 6144.
import math


def doubler(circonscrit, inscrit):
    """Les périmètres pour deux fois plus de côtés (formules d'Archimède).

    >>> a, b = doubler(2 * math.sqrt(3), 3)
    >>> round(a, 4), round(b, 4)
    (3.2154, 3.1058)
    """
    circonscrit = 2 * circonscrit * inscrit / (circonscrit + inscrit)
    inscrit = math.sqrt(circonscrit * inscrit)
    return circonscrit, inscrit


# L'hexagone : inscrit, ses côtés valent le rayon ; circonscrit, 1/√3.
cotes = 6
circonscrit, inscrit = 2 * math.sqrt(3), 3
print(f"{cotes:5} côtés : {inscrit:.10f} < π < {circonscrit:.10f}")
for _ in range(10):
    circonscrit, inscrit = doubler(circonscrit, inscrit)
    cotes = 2 * cotes
    print(f"{cotes:5} côtés : {inscrit:.10f} < π < {circonscrit:.10f}")

print(f"\n             π = {math.pi:.10f}")
print("Avec 96 côtés, Archimède avait trouvé 3 + 10/71 < π < 3 + 1/7.")
