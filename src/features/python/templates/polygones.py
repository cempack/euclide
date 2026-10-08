# Des polygones réguliers, de 3 à 8 côtés.
from turtle import *


def polygone(n, cote):
    for _ in range(n):
        forward(cote)
        left(360 / n)


speed(0)
for n in range(3, 9):
    polygone(n, 60)
done()
