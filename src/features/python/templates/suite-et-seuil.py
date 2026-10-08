# Suite (u_n) : u_0 = 1000 et u_(n+1) = 0,9 × u_n + 50.
# À partir de quel rang u_n passe-t-il sous 600 ?

u = 1000
n = 0
while u >= 600:
    u = 0.9 * u + 50
    n = n + 1

print("Rang :", n)
print("u_n ≈", round(u, 2))
