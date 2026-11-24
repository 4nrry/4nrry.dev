#!/usr/bin/env python3
"""02 rasa: igual a 01 (rubro, ambar pontual, tres pecas) mas em perspectiva rasa: o tabuleiro foge
para um horizonte baixo. Camera de furo a 4 casas de altura, horizonte na linha 50."""
from engine import *
P = get_pieces()
proj = Persp(f=900, hc=4.0, yh=50, cx=750, lod_lo=6.0, lod_hi=14.0, y_min=128)
s = proj.scale
pl = [dict(piece="rubro-cavalo", x=690, y=455, h=2.8 * s(455)),
      dict(piece="rubro-torre", x=1010, y=425, h=2.2 * s(425)),
      dict(piece="ambar-peao", x=1215, y=372, h=1.5 * s(372))]
compose("02-rasa", proj, light=(0.56, 0.0), dark=(0.0, 0.0), placements=pl, P=P,
        meta={"angulo": "perspectiva rasa", "camera": {"f": 900, "altura_casas": 4.0, "horizonte_y": 50}, "dominante": "rubro"})
