#!/usr/bin/env python3
"""As duas ilusoes opticas de v3, desenhadas em codigo.

Nas duas o campo e CHAPADO de proposito: a ilusao depende de valores exatos (duas casas com o
mesmo RGB; uma argamassa de valor intermediario), e uma reticula de meio-tom tiraria a igualdade
pixel a pixel. So as pecas ficam em meio-tom, como pecas impressas pousadas num tabuleiro pintado.
"""
import numpy as np
from PIL import Image, ImageDraw
from engine import *


# --------------------------------------------------------------------------------------
# utilidades


def bilinear(img, x, y):
    """Amostra bilinear de img (h, w) em coordenadas de pixel x, y (arrays); fora da imagem = 0."""
    h, w = img.shape
    x0, y0 = np.floor(x).astype(np.int32), np.floor(y).astype(np.int32)
    fx, fy = x - x0, y - y0
    def at(xx, yy):
        ok = (xx >= 0) & (xx < w) & (yy >= 0) & (yy < h)
        return np.where(ok, img[np.clip(yy, 0, h - 1), np.clip(xx, 0, w - 1)], 0.0)
    return (at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy)
            + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy)


def lin(c):
    c = np.asarray(c, np.float64) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def rel_lum(rgb):
    r, g, b = lin(rgb)
    return float(0.2126 * r + 0.7152 * g + 0.0722 * b)


def lstar(rgb):
    y = rel_lum(rgb)
    return 116 * (y ** (1 / 3)) - 16 if y > 0.008856 else 903.3 * y


def mid_lightness_color(hue_rgb, target_lstar):
    """Escala hue_rgb (0..255 floats) ate a luminosidade CIE L* alvo (bisseccao)."""
    lo, hi = 0.02, 3.0
    for _ in range(60):
        k = (lo + hi) / 2
        c = np.clip(np.array(hue_rgb) * k, 0, 255)
        if lstar(c) < target_lstar:
            lo = k
        else:
            hi = k
    return tuple(int(round(v)) for v in np.clip(np.array(hue_rgb) * hi, 0, 255))


# --------------------------------------------------------------------------------------
# 1. checker-shadow de Adelson


def shadow_grid(piece, H_w, u0, v0, lx, lz, g=48, u_rng=(-3.0, 14.0), v_rng=(-2.0, 12.0), sig_near=0.05, sig_far=0.12):
    """Sombra de uma peca de revolucao no plano do tabuleiro. Uma luz distante desloca lx em u e lz
    em v por unidade de altura. A peca e um solido de revolucao: a cada altura a secao e um DISCO
    de raio igual a meia largura da silhueta, entao a sombra e a uniao desses discos arrastados
    ao longo da direcao da luz (nao a silhueta achatada, que seria bem mais estreita). Penumbra
    cresce com a altura. Retorna S (0 luz, 1 umbra exatos) e a grade."""
    us = np.arange(u_rng[0], u_rng[1], 1.0 / g, dtype=np.float32) + 0.5 / g
    vs = np.arange(v_rng[0], v_rng[1], 1.0 / g, dtype=np.float32) + 0.5 / g
    U, V = np.meshgrid(us, vs)
    k = (piece.h - 28) / H_w                         # px da peca por unidade do mundo
    S0 = np.zeros_like(U)
    HH = np.zeros_like(U)                            # altura de quem manda na sombra daquele ponto
    N = 160
    top = 14
    for n in range(N):
        hh = (n + 0.5) / N * H_w
        py = int(round(piece.base_y - hh * k))
        if py < top or py >= piece.h:
            continue
        row = piece.alpha[py] > 0.5
        if not row.any():
            continue
        xs = np.where(row)[0]
        rad = (xs.max() - xs.min() + 1) / 2.0 / k
        cu, cv = u0 + lx * hh, v0 + lz * hh
        du, dv = U - cu, V - cv
        # so toca a janela do disco
        j0 = max(0, int((cv - rad - v_rng[0]) * g) - 2); j1 = min(U.shape[0], int((cv + rad - v_rng[0]) * g) + 3)
        i0 = max(0, int((cu - rad - u_rng[0]) * g) - 2); i1 = min(U.shape[1], int((cu + rad - u_rng[0]) * g) + 3)
        if j1 <= j0 or i1 <= i0:
            continue
        d = np.hypot(du[j0:j1, i0:i1], dv[j0:j1, i0:i1])
        m = np.clip((rad - d) * g + 0.5, 0, 1)
        sl = (slice(j0, j1), slice(i0, i1))
        upd = m > S0[sl]
        S0[sl] = np.where(upd, m, S0[sl])
        HH[sl] = np.where(upd, hh, HH[sl])
    Sa, Sb = blur(S0, sig_near * g), blur(S0, sig_far * g)
    t = np.clip(HH / H_w, 0, 1)
    S = Sa * (1 - t) + Sb * t
    S = np.clip((S - 0.012) / 0.976, 0, 1)           # umbra exatamente 1, luz exatamente 0
    return S.astype(np.float32), u_rng, v_rng, g


def sample_grid(S, u_rng, v_rng, g, u, v):
    gx = (u - u_rng[0]) * g - 0.5
    gy = (v - v_rng[0]) * g - 0.5
    return bilinear(S, gx, gy)


def adelson(name, P, piece_name, L=(200, 74, 56), ratio=0.55, nu=18, nv=12, H_w=8.5, u0=5.0, v0=3.0,
            lx=1.1, lz=0.7, proj=None, out_dir=HERE, search=True, force_AB=None, f=700.0, hc=20.0, cx=810.0, y_near=475.0, width_near=760.0):
    """Banner do checker-shadow. L = cor da casa clara; D = round(L*ratio) e a casa escura; a sombra
    leva L exatamente a D (mistura por canal) e D a D*ratio. Logo uma casa clara na umbra e uma casa
    escura na luz tem o MESMO RGB, e e isso que o arquivo prova."""
    Lc = np.array(L, np.float64)
    Dc = np.round(Lc * ratio)
    r = Dc / Lc                                       # razao exata por canal
    if proj is None:
        s_near = width_near / nu                      # px por casa na borda proxima
        yh = y_near - s_near * hc
        proj = Persp(f=f, hc=hc, yh=yh, cx=cx, xshift=nu / 2, zshift=f * hc / (y_near - yh))
    # --- sombra
    piece = P[piece_name]
    S, u_rng, v_rng, g = shadow_grid(piece, H_w, u0, v0, lx, lz, u_rng=(-3.0, nu + 4.0), v_rng=(-2.0, nv + 4.0))
    # --- candidatas A (escura na luz) e B (clara na umbra)
    # a peca em px
    xb, yb = proj.forward(u0, v0)
    hpx = H_w * proj.scale(yb)
    cover = np.zeros((H, W), np.float32)
    Rt, At = np.zeros((H, W), np.float32), np.zeros((H, W), np.float32)
    pp = place_piece(Rt, At, piece, xb, yb, hpx, cover=cover)
    pbox = pp.bbox
    def sq_poly(i, j):
        return [proj.forward(i + du, j + dv) for du, dv in ((0, 0), (1, 0), (1, 1), (0, 1))]
    def sq_stats(i, j, inset=0.12, n=9):
        t = np.linspace(inset, 1 - inset, n)
        uu, vv = np.meshgrid(i + t, j + t)
        s = sample_grid(S, u_rng, v_rng, g, uu, vv)
        return float(s.min()), float(s.max()), float(s.mean())
    def hits_piece(i, j, margin=16):
        xs = [p[0] for p in sq_poly(i, j)]; ys = [p[1] for p in sq_poly(i, j)]
        return not (max(xs) < pbox[0] - margin or min(xs) > pbox[2] + margin or max(ys) < pbox[1] - margin or min(ys) > pbox[3] + margin)
    def in_crop(i, j):
        xs = [p[0] for p in sq_poly(i, j)]
        return min(xs) > CROP[0] + 20 and max(xs) < CROP[1] - 20
    cands_B, cands_A = [], []
    for i in range(nu):
        for j in range(nv):
            mn, mx, me = sq_stats(i, j)
            light = (i + j) % 2 == 0
            if hits_piece(i, j) or not in_crop(i, j):
                continue
            if light and mn >= 0.999:
                nb = [(i + a, j + b) for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= i + a < nu and 0 <= j + b < nv]
                sh = np.mean([sq_stats(a, b)[2] for a, b in nb]) if nb else 0
                cands_B.append((sh, i, j))
            if (not light) and mx <= 0.001:
                nb = [(i + a, j + b) for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= i + a < nu and 0 <= j + b < nv]
                lit = 1 - np.mean([sq_stats(a, b)[2] for a, b in nb]) if nb else 0
                cands_A.append((lit, i, j))
    best = None
    for sh, bi, bj in cands_B:
        for lit, ai, aj in cands_A:
            d = np.hypot(ai - bi, aj - bj)
            sc = sh + lit - 0.15 * abs(d - 3.2)          # a distancia tipica da demonstracao: ~3 casas, com a borda da sombra no meio
            if best is None or sc > best[0]:
                best = (sc, (ai, aj), (bi, bj), sh, lit)
    if force_AB:
        best = (0, force_AB[0], force_AB[1], 0, 0)
    assert best, "nenhum par A/B cabe: ajuste a luz, o tamanho da peca ou a posicao"
    A_sq, B_sq = best[1], best[2]
    # --- imagem plana
    ss = 3
    xs_ = (np.arange(W * ss, dtype=np.float32) + 0.5) / ss
    ys_ = (np.arange(H * ss, dtype=np.float32) + 0.5) / ss
    X, Y = np.meshgrid(xs_, ys_)
    u, v, valid = proj.inverse(X, Y)
    inb = valid & (u >= 0) & (u < nu) & (v >= 0) & (v < nv)
    i, j = np.floor(u).astype(np.int32), np.floor(v).astype(np.int32)
    light = ((i + j) & 1) == 0
    Sx = sample_grid(S, u_rng, v_rng, g, u, v)
    base = np.where(light[..., None], Lc[None, None, :], Dc[None, None, :])
    col = base * (1 - Sx[..., None] * (1 - r[None, None, :]))
    col = np.where(inb[..., None], col, np.array(BG, np.float64)[None, None, :])
    img = col.reshape(H, ss, W, ss, 3).mean(axis=(1, 3)).astype(np.float32)
    # --- peca impressa por cima
    pr = print_plates(Rt, At, halftone=True)
    img = img * (1 - cover[..., None]) + pr * cover[..., None]
    # --- fio de cabelo: contorno do tabuleiro e reguas na borda proxima
    hl = []
    c = [proj.forward(0, 0), proj.forward(nu, 0), proj.forward(nu, nv), proj.forward(0, nv)]
    for k in range(4):
        hl.append(("line", c[k][0], c[k][1], c[(k + 1) % 4][0], c[(k + 1) % 4][1]))
    for k in range(nu + 1):
        x, y = proj.forward(k, 0)
        ln = 11 if k % 5 == 0 else 6
        hl.append(("line", x, y + 6, x, y + 6 + ln))
    # o contorno e desenhado sob a peca? nao: a peca fica por cima, entao refaz a composicao
    base_img = img
    # --- sem as reguas por cima da peca: as linhas estao fora da regiao coberta
    img = hairlines(base_img, hl) * (1 - cover[..., None]) + base_img * cover[..., None]
    flat_note = None
    arr = save_png(img, os.path.join(out_dir, name + ".png"))
    # valores medidos direto do arquivo gravado
    def interior(i_, j_):
        c4 = np.array(sq_poly(i_, j_))
        cen = c4.mean(0)
        small = cen + (c4 - cen) * 0.55
        im = Image.new("L", (W, H), 0)
        ImageDraw.Draw(im).polygon([tuple(p) for p in small], fill=255)
        return np.asarray(im) > 0
    mA, mB = interior(*A_sq), interior(*B_sq)
    vA, vB = arr[mA], arr[mB]
    uA, uB = np.unique(vA, axis=0), np.unique(vB, axis=0)
    meta = {
        "ilusao": "checker-shadow de Adelson",
        "luz": {"lx": lx, "lz": lz}, "peca": piece_name, "altura_mundo_casas": H_w,
        "casa_clara_L": [int(x) for x in Lc], "casa_escura_D": [int(x) for x in Dc],
        "razao_por_canal": [round(float(x), 5) for x in r],
        "A_casa": list(map(int, A_sq)), "B_casa": list(map(int, B_sq)),
        "A_poligono_px": [[round(float(a), 1), round(float(b), 1)] for a, b in sq_poly(*A_sq)],
        "B_poligono_px": [[round(float(a), 1), round(float(b), 1)] for a, b in sq_poly(*B_sq)],
        "A_rgb_unicos_no_interior": [list(map(int, x)) for x in uA], "B_rgb_unicos_no_interior": [list(map(int, x)) for x in uB],
        "A_pixels": int(mA.sum()), "B_pixels": int(mB.sum()),
        "vizinhas_B_sombra_media": round(float(best[3]), 3), "vizinhas_A_luz_media": round(float(best[4]), 3),
        "candidatas": {"A": len(cands_A), "B": len(cands_B)},
    }
    assert len(uA) == 1 and len(uB) == 1 and (uA[0] == uB[0]).all(), ("A e B nao sao iguais", uA, uB)
    # --- imagem de prova: uma barra do mesmo RGB ligando A a B (a olho, a igualdade aparece)
    cA, cB = np.array(sq_poly(*A_sq)).mean(0), np.array(sq_poly(*B_sq)).mean(0)
    ov = Image.fromarray(arr.copy(), "RGB")
    d = ImageDraw.Draw(ov)
    d.line([tuple(cA), tuple(cB)], fill=tuple(int(x) for x in uA[0]), width=18)
    prova = os.path.join(out_dir, name + "-prova.png")
    tmp = prova + ".tmp.png"; ov.save(tmp)
    subprocess.run(["vips", "copy", tmp, prova + "[profile=srgb,compression=9]"], check=True); os.remove(tmp)
    # previa em tom continuo para a metrica de 500 px (aqui o campo ja e liso: a previa e a propria imagem)
    Image.fromarray(arr, "RGB").save(os.path.join(HERE, ".tmp", name + "-flat.png"))
    meta["nome"] = name
    meta["pecas"] = [pp.as_dict()]
    write_meta(os.path.join(out_dir, name + ".json"), meta)
    return arr, meta


# --------------------------------------------------------------------------------------
# 2. cafe wall


def cafe_wall(name, L=(244, 178, 72), D=(44, 9, 10), tile=44, rows=9, cols=18, mortar=3, x0=440,
              hue=None, mortar_lstar=None, out_dir=HERE):
    """Parede de cafe: fileiras de casas deslocadas meia casa, separadas por uma argamassa horizontal
    de valor intermediario. Tudo chapado: o valor da argamassa e o que faz a ilusao."""
    pw = cols * tile
    ph = rows * tile + (rows - 1) * mortar
    y0 = (H - ph) // 2
    x1 = x0 + pw
    if mortar_lstar is None:
        mortar_lstar = (lstar(L) + lstar(D)) / 2
    hue = hue or tuple((np.array(L, float) + np.array(D, float)) / 2)     # matiz = media sRGB das duas casas
    M = mid_lightness_color(hue, mortar_lstar)
    img = np.empty((H, W, 3), np.float32); img[:] = np.array(BG, np.float32)
    xs = np.arange(x0, x1)
    mortar_rows = []
    for rw in range(rows):
        ytop = y0 + rw * (tile + mortar)
        shift = (rw % 2) * tile // 2
        k = np.floor((xs - x0 - shift) / tile).astype(int)
        colr = np.where((k % 2 == 0)[:, None], np.array(L, np.float32)[None, :], np.array(D, np.float32)[None, :])
        img[ytop:ytop + tile, x0:x1] = colr[None, :, :]
        if rw < rows - 1:
            img[ytop + tile:ytop + tile + mortar, x0:x1] = np.array(M, np.float32)
            mortar_rows.append((ytop + tile, ytop + tile + mortar))
    # fio de cabelo: moldura, reguas e marcas de registro (a linguagem de prancha do Hydraulis)
    hl = [("rect", x0 - 12, y0 - 12, x1 + 12, y0 + ph + 12)]
    for k in range(cols + 1):
        x = x0 + k * tile
        ln = 9 if k % 7 == 0 else 5
        hl.append(("line", x, y0 - 12, x, y0 - 12 - ln))
        hl.append(("line", x, y0 + ph + 12, x, y0 + ph + 12 + ln))
    for (cx_, cy_) in ((x0 - 12, y0 - 12), (x1 + 12, y0 - 12), (x0 - 12, y0 + ph + 12), (x1 + 12, y0 + ph + 12)):
        hl.append(("circle", cx_, cy_, 7))
        hl.append(("line", cx_ - 12, cy_, cx_ + 12, cy_))
        hl.append(("line", cx_, cy_ - 12, cx_, cy_ + 12))
    img = hairlines(img, hl)
    arr = save_png(img, os.path.join(out_dir, name + ".png"))
    Image.fromarray(arr, "RGB").save(os.path.join(HERE, ".tmp", name + "-flat.png"))
    meta = {
        "nome": name, "ilusao": "cafe wall",
        "painel_px": [x0, y0, x1, y0 + ph], "casa_px": tile, "fileiras": rows, "colunas": cols, "argamassa_px": mortar,
        "casa_clara": list(L), "casa_escura": list(D), "argamassa": list(M),
        "L_estrela": {"clara": round(lstar(L), 1), "escura": round(lstar(D), 1), "argamassa": round(lstar(M), 1)},
        "argamassa_linhas_y": mortar_rows, "deslocamento_alternado_px": tile // 2,
        "pecas": [],
    }
    write_meta(os.path.join(out_dir, name + ".json"), meta)
    return arr, meta
