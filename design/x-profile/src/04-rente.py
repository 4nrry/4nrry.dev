#!/usr/bin/env python3
"""04 rente: camera na altura da peca (1 casa), horizonte na linha 170. Tres pecas em tres profundidades
(a torre grande vira silhueta contra o fundo liso; o cavalo e o peao recuam). Mesmo tabuleiro e mesmas
pecas de 01, ambar pontual."""
from engine import *
P = get_pieces()
proj = Persp(f=800, hc=1.0, yh=170, cx=750, lod_lo=6.0, lod_hi=14.0, y_min=203)
s = proj.scale
pl = [dict(piece="rubro-torre", x=640, y=478, h=1.35 * s(478)),
      dict(piece="rubro-cavalo", x=1040, y=372, h=1.5 * s(372)),
      dict(piece="ambar-peao", x=1235, y=300, h=1.0 * s(300))]
compose("04-rente", proj, light=(0.56, 0.0), dark=(0.0, 0.0), placements=pl, P=P,
        meta={"angulo": "rente ao tabuleiro", "camera": {"f": 800, "altura_casas": 1.0, "horizonte_y": 170}, "dominante": "rubro"})
