#!/usr/bin/env python3
"""05 sombra: checker-shadow de Adelson. A torre ambar lanca a sombra; uma casa escura na luz (A) e uma
casa clara na sombra (B) tem o MESMO RGB, medido por pixel. Campo chapado de proposito."""
from engine import *
from ilusoes import *
P = get_pieces()
arr, meta = adelson("05-sombra", P, "ambar-torre", L=(192, 64, 50), ratio=0.55)
print(json.dumps({k: meta[k] for k in ("A_casa", "B_casa", "A_rgb_unicos_no_interior", "B_rgb_unicos_no_interior")}))
