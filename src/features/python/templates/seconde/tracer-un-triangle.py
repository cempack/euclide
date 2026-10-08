# Modèle : Tracer un triangle
# Résumé : Les sommets, les milieux et le centre de gravité.

# Le triangle ABC, les milieux de ses côtés, ses trois médianes
# et leur point commun G, le centre de gravité du triangle.
import matplotlib.pyplot as plt

xa, ya = 0, 0
xb, yb = 6, 1
xc, yc = 2, 5

# Les milieux des côtés : I de [BC], J de [AC], K de [AB]
xi, yi = (xb + xc) / 2, (yb + yc) / 2
xj, yj = (xa + xc) / 2, (ya + yc) / 2
xk, yk = (xa + xb) / 2, (ya + yb) / 2

# Le centre de gravité : la moyenne des coordonnées des sommets
xg, yg = (xa + xb + xc) / 3, (ya + yb + yc) / 3

print(f"I({xi} ; {yi}), J({xj} ; {yj}), K({xk} ; {yk})")
print(f"G({xg:.2f} ; {yg:.2f})")

plt.plot([xa, xb, xc, xa], [ya, yb, yc, ya], color="k", linewidth=2)
plt.plot([xa, xi], [ya, yi], "--", color="gray")
plt.plot([xb, xj], [yb, yj], "--", color="gray")
plt.plot([xc, xk], [yc, yk], "--", color="gray")
plt.scatter([xi, xj, xk], [yi, yj, yk], color="b", label="milieux des côtés")
plt.scatter([xg], [yg], color="r", label="centre de gravité G")

plt.text(xa - 0.35, ya - 0.35, "A")
plt.text(xb + 0.15, yb - 0.1, "B")
plt.text(xc - 0.1, yc + 0.2, "C")
plt.text(xi + 0.15, yi, "I")
plt.text(xj - 0.35, yj, "J")
plt.text(xk, yk - 0.4, "K")
plt.text(xg + 0.15, yg + 0.1, "G")

plt.axis("equal")
plt.title("Les médianes du triangle ABC se coupent en G")
plt.legend()
plt.show()
