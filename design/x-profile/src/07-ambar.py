#!/usr/bin/env python3
"""07 ambar: igual a 01, trocando so o dominio de cor: casas claras em ambar, casas escuras com um
rubro fraco, pecas em ambar com um rubro pontual."""
from engine import *
P = get_pieces()
proj = Top(100, 0, 0)
pl = [dict(piece="ambar-cavalo", x=650, y=470, h=340),
      dict(piece="ambar-torre", x=950, y=410, h=230),
      dict(piece="rubro-peao", x=1180, y=455, h=150)]
compose("07-ambar", proj, light=(0.0, 0.46), dark=(0.20, 0.0), placements=pl, P=P,
        hair=ruler_top(500, 1500, 100), meta={"angulo": "plano", "casa_px": 100, "dominante": "ambar"})
