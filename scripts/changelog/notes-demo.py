# Statistiques d'une liste de notes : complète, puis « Vérifier ».


def moyenne(notes):
    """
    >>> moyenne([10, 12, 14])
    12.0
    """
    return sum(notes) / len(notes)


def maximum(notes):
    """
    >>> maximum([8, 15, 11])
    15
    """
    m = notes[0]
    for n in notes:
        if n > m:
            m = n
    return m


def mention(note):
    """
    >>> mention(12)
    'Assez bien'
    >>> mention(16)
    'Très bien'
    """
    if note >= 16:
        return "Très bien"
    if note >= 14:
        return "Bien"
    if note > 12:
        return "Assez bien"
    return "Passable"


notes = [12, 15, 9, 17, 11]
print("Moyenne :", moyenne(notes))
print("Meilleure note :", maximum(notes))
