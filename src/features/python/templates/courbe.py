# La courbe d'une fonction, avec ses axes.
import matplotlib.pyplot as plt


def f(x):
    return x**2 - 2 * x - 3


xs = [x / 10 for x in range(-30, 51)]
ys = [f(x) for x in xs]

plt.plot(xs, ys, label="f(x) = x² − 2x − 3")
plt.axhline(0, color="gray")
plt.axvline(0, color="gray")
plt.grid(True)
plt.legend()
plt.title("Courbe de f")
plt.show()
