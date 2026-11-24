#!/usr/bin/env python3
"""08 posicao: igual a 01 (plano, 100 px, rubro dominante) mas com uma posicao de meio de jogo: oito pecas,
cinco rubro contra tres ambar. Muda so a densidade de pecas."""
from engine import *
P = get_pieces()
proj = Top(100, 0, 0)
pl = [dict(piece="rubro-dama", x=530, y=470, h=330),
      dict(piece="rubro-peao", x=690, y=335, h=150),
      dict(piece="rubro-bispo", x=790, y=430, h=270),
      dict(piece="rubro-cavalo", x=930, y=480, h=300),
      dict(piece="rubro-torre", x=1040, y=360, h=215),
      dict(piece="ambar-cavalo", x=1085, y=478, h=290, flip=True),
      dict(piece="ambar-peao", x=1175, y=385, h=150),
      dict(piece="ambar-torre", x=1235, y=480, h=225)]
compose("08-posicao", proj, light=(0.56, 0.0), dark=(0.0, 0.0), placements=pl, P=P,
        hair=ruler_top(500, 1500, 100), meta={"angulo": "plano", "casa_px": 100, "dominante": "rubro"})
