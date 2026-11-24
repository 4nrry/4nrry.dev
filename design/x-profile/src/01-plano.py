#!/usr/bin/env python3
"""01 plano: o xadrez visto de cima, sem profundidade, casas grandes (100 px), rubro dominante com
um ambar pontual, tres pecas. E a linha de base: as outras mudam UMA coisa em relacao a esta."""
from engine import *
P = get_pieces()
proj = Top(100, 0, 0)                         # grade alinhada ao retangulo da foto: 4 x 2 casas inteiras
pl = [dict(piece="rubro-cavalo", x=650, y=470, h=340),
      dict(piece="rubro-torre", x=950, y=410, h=230),
      dict(piece="ambar-peao", x=1180, y=455, h=150)]
compose("01-plano", proj, light=(0.56, 0.0), dark=(0.0, 0.0), placements=pl, P=P,
        hair=ruler_top(500, 1500, 100), meta={"angulo": "plano", "casa_px": 100, "dominante": "rubro"})
