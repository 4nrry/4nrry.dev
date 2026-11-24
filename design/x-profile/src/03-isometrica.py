#!/usr/bin/env python3
"""03 isometrica: igual a 01 mas em isometrica de jogo (casa = losango de 140 x 70 px). Pecas em pe, sem
escala por profundidade."""
from engine import *
P = get_pieces()
proj = Iso(70, 35, 750, 0, 100)
def sq(u, v):
    x, y = proj.forward(u + 0.5, v + 0.5)
    return x, y + 10
pl = []
for piece, (u, v), hw in (("rubro-cavalo", (5, 6), 2.8), ("rubro-torre", (6, 2), 2.1), ("ambar-peao", (8, 2), 1.5)):
    x, y = sq(u, v)
    pl.append(dict(piece=piece, x=x, y=y, h=hw * 100))
compose("03-isometrica", proj, light=(0.56, 0.0), dark=(0.0, 0.0), placements=pl, P=P,
        meta={"angulo": "isometrica", "casa_px": "140 x 70 (losango)", "dominante": "rubro"})
