#!/usr/bin/env python3
"""Motor dos banners v3 (xadrez + pecas geradas, impressas em meio-tom de duas chapas).

Tudo o que nao e peca e desenhado aqui em codigo. As pecas vem de pecas/*.png
(geradas pelo Grok Imagine) e sao recortadas, "descreenadas" e reimpressas com a
mesma reticula do tabuleiro: uma chapa rubro (45 graus) e uma chapa ambar (15 graus)
sobre o papel escuro. Assim peca e tabuleiro compartilham a retícula.

Nada aqui gera imagem por modelo. Bibliotecas: numpy e Pillow (vips so para gravar o PNG sRGB).
"""
import json, os, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
PECAS = os.path.join(HERE, "pecas")
W, H = 1500, 500
AVATAR = (0, 300, 380, 500)        # x0, y0, x1, y1 (x1, y1 exclusivos)
CROP = (200, 1300)

# paleta: o papel e as duas tintas. Rubro e ambar sao a escolha do usuario; o resto do
# Hydraulis (tratamento: meio-tom, fio de cabelo, ar de prancha) fica, a cor azul nao.
BG = (14, 11, 10)                   # papel (chapado, #0e0b0a)
RUBY = (212, 46, 40)                # tinta rubro, #d42e28
AMBER = (246, 168, 56)              # tinta ambar, #f6a838
HAIR = (120, 30, 26)                # fio de cabelo das reguas (rubro apagado)

PITCH = 5.0                         # passo da reticula em px do banner final
ANG_RUBY, ANG_AMBER = 45.0, 15.0

# --------------------------------------------------------------------------------------
# utilidades de imagem float


def blur(a, sigma):
    """Gaussiana separavel em array float32 2D (numpy puro; o Pillow nao filtra o modo F)."""
    a = np.asarray(a, np.float32)
    r = max(1, int(np.ceil(3 * sigma)))
    x = np.arange(-r, r + 1, dtype=np.float32)
    k = np.exp(-0.5 * (x / sigma) ** 2)
    k /= k.sum()
    out = a
    for axis in (0, 1):
        pad = [(0, 0), (0, 0)]
        pad[axis] = (r, r)
        p = np.pad(out, pad, mode="reflect")
        acc = np.zeros_like(out)
        n = out.shape[axis]
        for i in range(2 * r + 1):
            sl = [slice(None), slice(None)]
            sl[axis] = slice(i, i + n)
            acc += k[i] * p[tuple(sl)]
        out = acc
    return out


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def resize_f(a, size, resample=Image.LANCZOS):
    return np.asarray(Image.fromarray(a.astype(np.float32), mode="F").resize(size, resample), dtype=np.float32)


# --------------------------------------------------------------------------------------
# pecas


class Piece:
    """Uma peca recortada: mapas de tom das duas chapas e alfa, ja cortados na caixa."""

    def __init__(self, name, R, A, alpha, base_cx, base_y, rgba):
        self.name, self.R, self.A, self.alpha = name, R, A, alpha
        self.h, self.w = alpha.shape
        self.base_cx, self.base_y = base_cx, base_y   # px na caixa recortada
        self.rgba = rgba                              # recorte nas cores originais (entrega)


def load_piece(name, mode, thr=9.0, thr_y=52.0, sym=False, base_extra=6, close=9, save_dir=None):
    """Recorta `pecas/<name>.png`. mode: 'rubro' ou 'ambar' (como as chapas sao calculadas)."""
    src = os.path.join(PECAS, name + ".png")
    a = np.asarray(Image.open(src).convert("RGB"), dtype=np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    sat = r - 0.5 * (g + b)                              # "vermelhidao": o fundo e quase neutro
    lum = 0.30 * r + 0.59 * g + 0.11 * b
    s = blur(np.clip(sat, 0, 255), 2.5)
    ly = blur(lum, 2.5)
    # peca = vermelha/quente o bastante OU bem mais clara que o fundo (o ambar apagado tem pouca saturacao)
    mb = (s > thr) | (ly > thr_y)
    if sym:
        # pecas de revolucao: corta o piso abaixo do aro da base (linha onde a saturacao forte acaba)
        # e fica so com o que e simetrico em torno do eixo; sombra projetada e piso iluminado sao
        # assimetricos e saem, a peca (mesmo com um lado escuro) fica
        rows = np.where((s > 20).sum(1) > 25)[0]
        mb[rows.max() + base_extra:, :] = False
        clean = np.asarray(Image.fromarray(mb.astype(np.uint8) * 255).filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(7))) > 0
        big = np.where(clean.sum(1) > 25)[0]
        ytop, ybot = big.min(), rows.max()
        band = clean[ytop:ytop + int(0.6 * (ybot - ytop)), :]
        cols = np.where(band.any(0))[0]
        axis = (cols.min() + cols.max()) / 2.0
        xs = np.arange(mb.shape[1])
        mirror = np.round(2 * axis - xs).astype(int)
        okc = (mirror >= 0) & (mirror < mb.shape[1])
        mm = np.zeros_like(mb)
        mm[:, okc] = mb[:, mirror[okc]]
        mb = mb & mm
    m = mb.astype(np.uint8) * 255
    mi = Image.fromarray(m)
    if close > 9:   # base escura que o limiar nao pegou: fecha as reentrancias com um fechamento largo
        mb2 = close_np(np.asarray(mi) > 0, close)
        mi = Image.fromarray(mb2.astype(np.uint8) * 255)
    mi = mi.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))      # fecha frestas
    mi = mi.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))      # tira cisco
    # preenche buracos: o que nao e alcancado pelo fundo a partir da borda
    inv = mi.copy()
    for seed in ((0, 0), (inv.width - 1, 0), (0, inv.height - 1), (inv.width - 1, inv.height - 1)):
        if inv.getpixel(seed) == 0:
            ImageDraw.floodfill(inv, seed, 128)
    filled = (np.asarray(inv) != 128).astype(np.float32)
    # fica so o maior corpo conexo: a peca (cisco solto some)
    filled = largest_component(filled)
    alpha = blur(filled, 1.1)
    alpha = np.clip((alpha - 0.5) * 2.2 + 0.5, 0, 1)
    ys, xs = np.where(filled > 0.5)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    pad = 14
    y0, x0 = max(0, y0 - pad), max(0, x0 - pad)
    y1, x1 = min(a.shape[0], y1 + pad), min(a.shape[1], x1 + pad)
    # cor "descreenada": media normalizada pela mascara (nao puxa o fundo para dentro da borda)
    wgt = blur(filled, 1.8) + 1e-4
    rr, gg, bb = (blur(c * filled, 1.8) / wgt for c in (r, g, b))
    Y = 0.30 * rr + 0.59 * gg + 0.11 * bb
    if mode == "rubro":
        R = np.clip((rr - 18) / 190.0, 0, 1) ** 0.85
        A = np.clip((gg - 48) / 85.0, 0, 1) ** 1.05
    else:
        A = np.clip((Y - 24) / 135.0, 0, 1) ** 0.8
        R = 0.26 * (1 - A) ** 1.6
    R, A = R * alpha, A * alpha
    # base: ultima linha opaca; centro x da base = centro das colunas opacas nas ultimas linhas
    base_y_abs = y1 - pad
    band = filled[base_y_abs - 14:base_y_abs, :]
    cols = np.where(band.any(0))[0]
    base_cx_abs = (cols.min() + cols.max()) / 2.0
    crop = lambda z: z[y0:y1, x0:x1]
    rgba = np.dstack([a.astype(np.uint8), (alpha * 255).astype(np.uint8)])
    rgba_c = rgba[y0:y1, x0:x1].copy()
    p = Piece(name, crop(R), crop(A), crop(alpha), base_cx_abs - x0, base_y_abs - y0, rgba_c)
    if save_dir:
        os.makedirs(save_dir, exist_ok=True)
        Image.fromarray(rgba_c, "RGBA").save(os.path.join(save_dir, name + ".png"))
    return p


def _shift_max(a, r, axis, op):
    n = a.shape[axis]
    pad = [(0, 0), (0, 0)]
    pad[axis] = (r, r)
    p = np.pad(a, pad, mode="edge")
    out = None
    for i in range(2 * r + 1):
        sl = [slice(None), slice(None)]
        sl[axis] = slice(i, i + n)
        v = p[tuple(sl)]
        out = v.copy() if out is None else op(out, v)
    return out


def close_np(mask, k):
    """Fechamento morfologico (dilata e erode) com quadrado de lado k, numpy puro e separavel."""
    r = k // 2
    m = mask.astype(np.uint8)
    for axis in (0, 1):
        m = _shift_max(m, r, axis, np.maximum)
    for axis in (0, 1):
        m = _shift_max(m, r, axis, np.minimum)
    return m > 0


def largest_component(mask):
    """Maior componente conexa (4-vizinhos) de uma mascara 0/1, sem scipy: rotulagem por varredura de uniao."""
    h, w = mask.shape
    # reduz para rotular rapido, depois reaplica na resolucao cheia
    step = 4
    small = mask[::step, ::step] > 0.5
    sh, sw = small.shape
    lab = np.zeros((sh, sw), np.int32)
    parent = [0]

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    nxt = 1
    for y in range(sh):
        for x in range(sw):
            if not small[y, x]:
                continue
            up = lab[y - 1, x] if y else 0
            lf = lab[y, x - 1] if x else 0
            if up and lf:
                ru, rl = find(up), find(lf)
                lab[y, x] = min(ru, rl)
                if ru != rl:
                    parent[max(ru, rl)] = min(ru, rl)
            elif up or lf:
                lab[y, x] = up or lf
            else:
                lab[y, x] = nxt
                parent.append(nxt)
                nxt += 1
    roots = np.array([find(i) for i in range(len(parent))])
    lab = roots[lab]
    lab[~small] = 0
    counts = np.bincount(lab.ravel())
    counts[0] = 0
    keep = counts.argmax()
    keep_small = (lab == keep).astype(np.uint8) * 255
    keep_full = Image.fromarray(keep_small).resize((w, h), Image.NEAREST)
    keep_full = keep_full.filter(ImageFilter.MaxFilter(2 * step + 1))      # cobre a borda da reducao
    return mask * (np.asarray(keep_full) > 0)


# --------------------------------------------------------------------------------------
# tela de meio-tom


def screen(tone, pitch=PITCH, angle=45.0, eps=0.18):
    """Reticula de ponto redondo. tone 0..1 -> cobertura 0..1 (com anti-serrilhado de ~1 px).
    tone exatamente 0 da cobertura exatamente 0 (papel limpo)."""
    h, w = tone.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    th = np.radians(angle)
    u = (xx * np.cos(th) + yy * np.sin(th)) / pitch
    v = (-xx * np.sin(th) + yy * np.cos(th)) / pitch
    s = 0.5 + 0.25 * (np.cos(2 * np.pi * u) + np.cos(2 * np.pi * v))
    thr = (1 + eps) - tone * (1 + 2 * eps)
    k = pitch * 1.1
    return np.clip((s - thr) * k + 0.5, 0, 1)


def print_plates(R, A, halftone=True):
    """Duas chapas sobre o papel: rubro primeiro, ambar por cima. Retorna float32 HxWx3 (0..255)."""
    if halftone:
        cr, ca = screen(R, PITCH, ANG_RUBY), screen(A, PITCH, ANG_AMBER)
    else:  # previa em tom continuo, so para medir quanto da reticula vira "sujeira" a 500 px
        cr, ca = np.clip(R, 0, 1), np.clip(A, 0, 1)
    out = np.empty(R.shape + (3,), np.float32)
    for c in range(3):
        o = BG[c] * (1 - cr) + RUBY[c] * cr
        out[..., c] = o * (1 - ca) + AMBER[c] * ca
    return out


# --------------------------------------------------------------------------------------
# projecoes do plano do tabuleiro. Unidade do mundo: 1 casa. Cada uma tem
#   inverse(x, y) -> (u, v, valid)    pixel -> plano
#   forward(u, v) -> (x, y)           plano -> pixel
#   scale(y_base) -> px por unidade de altura (para o tamanho da peca em pe)


class Top:
    def __init__(self, q, ox=0.0, oy=0.0):
        self.q, self.ox, self.oy = q, ox, oy

    def inverse(self, x, y):
        return (x - self.ox) / self.q, (y - self.oy) / self.q, np.ones_like(x, bool)

    def forward(self, u, v):
        return self.ox + u * self.q, self.oy + v * self.q

    def scale(self, y):
        return self.q

    def lod(self, x, y):
        return np.ones_like(x)


class Persp:
    """Camara de furo a altura hc (em casas) olhando na horizontal; o horizonte fica na linha yh.
    x = cx + f*X/Z ;  y = yh + f*hc/Z."""

    def __init__(self, f, hc, yh, cx=750.0, xshift=0.0, zshift=0.0, lod_lo=2.0, lod_hi=6.0, y_min=None):
        self.f, self.hc, self.yh, self.cx, self.xshift, self.zshift = f, hc, yh, cx, xshift, zshift
        self.lod_lo, self.lod_hi = lod_lo, lod_hi
        self.y_min = y_min                      # corte duro do tabuleiro perto do horizonte (casas < 2 px)

    def inverse(self, x, y):
        d = y - self.yh
        valid = d > 0.5
        if self.y_min is not None:
            valid = valid & (y >= self.y_min)
        Z = np.where(d > 0.5, self.f * self.hc / np.where(d > 0.5, d, 1), 1e6)
        X = (x - self.cx) * Z / self.f
        return X + self.xshift, Z - self.zshift, valid

    def forward(self, u, v):
        X, Z = u - self.xshift, v + self.zshift
        return self.cx + self.f * X / Z, self.yh + self.f * self.hc / Z

    def scale(self, y):
        return (y - self.yh) / self.hc

    def lod(self, x, y):
        d = np.maximum(y - self.yh, 0.5)
        sq_h = d * d / (self.f * self.hc)           # altura de uma casa na tela, em px
        return smoothstep(self.lod_lo, self.lod_hi, sq_h)


class Iso:
    """Isometrica (2:1 em pixels, a "isometrica de jogo"): x = ox + (u-v)*a ; y = oy + (u+v)*b."""

    def __init__(self, a, b, ox, oy, piece_px_per_unit):
        self.a, self.b, self.ox, self.oy, self.ppu = a, b, ox, oy, piece_px_per_unit

    def inverse(self, x, y):
        xs, ys = (x - self.ox) / self.a, (y - self.oy) / self.b
        return (xs + ys) / 2, (ys - xs) / 2, np.ones_like(x, bool)

    def forward(self, u, v):
        return self.ox + (u - v) * self.a, self.oy + (u + v) * self.b

    def scale(self, y):
        return self.ppu

    def lod(self, x, y):
        return np.ones_like(x)


# --------------------------------------------------------------------------------------
# tabuleiro em tom


def square_fade_table(proj, imin, imax, jmin, jmax, ramp=140.0, margin=2.0, rect=AVATAR):
    """Para cada casa (i, j): 0 se a casa toca o retangulo da foto; depois sobe com a distancia.
    A casa nunca e cortada: ela inteira fica com o mesmo fator (o tamanho dos pontos)."""
    ii, jj = np.meshgrid(np.arange(imin, imax + 1), np.arange(jmin, jmax + 1), indexing="ij")
    cs = []
    for du, dv in ((0, 0), (1, 0), (1, 1), (0, 1)):
        x, y = proj.forward(ii + du, jj + dv)
        cs.append((x, y))
    xs = np.stack([c[0] for c in cs]); ys = np.stack([c[1] for c in cs])
    x0, x1, y0, y1 = xs.min(0), xs.max(0), ys.min(0), ys.max(0)
    rx0, ry0, rx1, ry1 = rect
    touch = (x1 > rx0 - margin) & (x0 < rx1 + margin) & (y1 > ry0 - margin) & (y0 < ry1 + margin)
    # distancia da caixa da casa ao retangulo
    dx = np.maximum(np.maximum(rx0 - x1, x0 - rx1), 0)
    dy = np.maximum(np.maximum(ry0 - y1, y0 - ry1), 0)
    d = np.hypot(dx, dy)
    # casas vizinhas ao retangulo ficam com ~45% do tom e sobem em degraus ate 100%: o tamanho
    # dos pontos desce casa por casa; nenhuma casa fica com tom tao baixo que pareca sujeira
    f = 0.45 + 0.55 * smoothstep(0.0, ramp, d)
    f = np.round(f * 4) / 4.0
    f[touch] = 0.0
    return f


def board_tones(proj, light, dark, ss=3, ramp=140.0, fade=True, phase=0):
    """Mapas de tom (R, A) do tabuleiro. light/dark = (tomR, tomA) de cada cor de casa."""
    xs = (np.arange(W * ss, dtype=np.float32) + 0.5) / ss
    ys = (np.arange(H * ss, dtype=np.float32) + 0.5) / ss
    X, Y = np.meshgrid(xs, ys)
    u, v, valid = proj.inverse(X, Y)
    i, j = np.floor(u).astype(np.int32), np.floor(v).astype(np.int32)
    if valid.any():
        imin, imax = int(i[valid].min()), int(i[valid].max())
        jmin, jmax = int(j[valid].min()), int(j[valid].max())
    else:
        imin = imax = jmin = jmax = 0
    if fade:
        tab = square_fade_table(proj, imin, imax, jmin, jmax, ramp=ramp)
        f = tab[np.clip(i - imin, 0, imax - imin), np.clip(j - jmin, 0, jmax - jmin)]
    else:
        f = np.ones_like(u)
    par = ((i + j + phase) & 1) == 0
    lod = proj.lod(X, Y)
    out = []
    for ch in (0, 1):
        tl, td = light[ch], dark[ch]
        t = np.where(par, tl, td) * lod + 0.5 * (tl + td) * (1 - lod)
        t = np.where(valid, t * f, 0.0).astype(np.float32)
        t = t.reshape(H, ss, W, ss).mean(axis=(1, 3))
        out.append(t)
    return out[0], out[1]


# --------------------------------------------------------------------------------------
# colocar pecas


def dilate(a, r):
    m = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    return np.asarray(m.filter(ImageFilter.MaxFilter(2 * r + 1)), dtype=np.float32) / 255.0


class Placed:
    def __init__(self, name, bbox, x_base, y_base, height):
        self.name, self.bbox, self.x_base, self.y_base, self.height = name, bbox, x_base, y_base, height

    def as_dict(self):
        return {"peca": self.name, "bbox": [int(v) for v in self.bbox], "base": [round(float(self.x_base), 1), round(float(self.y_base), 1)],
                "altura_px": round(float(self.height), 1)}


def place_piece(R, A, piece, x_base, y_base, height, flip=False, halo=5, shadow=0.55, tint=1.0, cover=None):
    """Pinta a peca nos mapas de tom R, A (in place). `height` e a altura do corpo em px.
    Antes limpa um anel de papel (halo) em volta da silhueta, como as gravuras deixam, e escurece
    uma poca de contato sob a base."""
    sc = height / (piece.h - 28)                     # 28 = 2 x pad do recorte
    nw, nh = max(2, int(round(piece.w * sc))), max(2, int(round(piece.h * sc)))
    al = resize_f(piece.alpha, (nw, nh), Image.LANCZOS)
    pr = resize_f(piece.R, (nw, nh), Image.LANCZOS)
    pa = resize_f(piece.A, (nw, nh), Image.LANCZOS)
    al = np.clip(al, 0, 1)
    if flip:
        al, pr, pa = al[:, ::-1], pr[:, ::-1], pa[:, ::-1]
    bx = (piece.w - piece.base_cx) * sc if flip else piece.base_cx * sc
    by = piece.base_y * sc
    ox, oy = int(round(x_base - bx)), int(round(y_base - by))
    # regiao de interesse com folga para o halo
    m = halo + 8
    x0, y0 = ox - m, oy - m
    x1, y1 = ox + nw + m, oy + nh + m
    cx0, cy0, cx1, cy1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
    if cx1 <= cx0 or cy1 <= cy0:
        return None
    big = np.zeros((y1 - y0, x1 - x0), np.float32)
    big[m:m + nh, m:m + nw] = al
    big_pr = np.zeros_like(big); big_pr[m:m + nh, m:m + nw] = pr
    big_pa = np.zeros_like(big); big_pa[m:m + nh, m:m + nw] = pa
    hal = blur(dilate(big, halo), 1.4)
    # poca de contato: elipse achatada sob a base
    bw = float(np.clip(nw * 0.55, 8, 400))
    yy, xx = np.mgrid[0:big.shape[0], 0:big.shape[1]].astype(np.float32)
    ex, ey = (xx - (x_base - x0)) / (bw * 0.62), (yy - (y_base - y0 + 2)) / (bw * 0.16)
    pool = np.exp(-(ex * ex + ey * ey) * 1.4) * shadow
    hal = np.maximum(hal, pool)
    sl = (slice(cy0 - y0, cy1 - y0), slice(cx0 - x0, cx1 - x0))
    dst = (slice(cy0, cy1), slice(cx0, cx1))
    if cover is not None:   # regiao "impressa" (peca + halo), para compor sobre fundo chapado
        cover[dst] = np.maximum(cover[dst], np.maximum(hal[sl], big[sl]))
    for arr, p in ((R, big_pr), (A, big_pa)):
        arr[dst] = arr[dst] * (1 - hal[sl])            # anel de papel
        arr[dst] = arr[dst] * (1 - big[sl]) + p[sl] * tint
    ys_, xs_ = np.where(big > 0.5)
    bbox = (max(0, ox + xs_.min() - m), max(0, oy + ys_.min() - m), min(W, ox + xs_.max() + 1 - m), min(H, oy + ys_.max() + 1 - m))
    return Placed(piece.name, bbox, x_base, y_base, height)


# --------------------------------------------------------------------------------------
# reguas de prancha (fio de cabelo, como no Hydraulis)


def hairlines(img, shapes, color=HAIR, width=1.0, ss=4):
    """shapes: lista de ('line', x0, y0, x1, y1) | ('rect', x0, y0, x1, y1) | ('circle', cx, cy, r).
    Desenha em superamostragem e compoe com anti-serrilhado sobre img (uint8 HxWx3)."""
    ov = Image.new("L", (W * ss, H * ss), 0)
    d = ImageDraw.Draw(ov)
    wpx = max(1, int(round(width * ss)))
    for s in shapes:
        if s[0] == "line":
            d.line([s[1] * ss, s[2] * ss, s[3] * ss, s[4] * ss], fill=255, width=wpx)
        elif s[0] == "rect":
            d.rectangle([s[1] * ss, s[2] * ss, s[3] * ss, s[4] * ss], outline=255, width=wpx)
        elif s[0] == "circle":
            d.ellipse([(s[1] - s[3]) * ss, (s[2] - s[3]) * ss, (s[1] + s[3]) * ss, (s[2] + s[3]) * ss], outline=255, width=wpx)
    a = np.asarray(ov.resize((W, H), Image.BOX), dtype=np.float32)[..., None] / 255.0
    return (img.astype(np.float32) * (1 - a) + np.array(color, np.float32) * a)


# --------------------------------------------------------------------------------------
# saida


def save_png(rgb_float, path):
    arr = np.clip(np.rint(rgb_float), 0, 255).astype(np.uint8)
    assert arr.shape == (H, W, 3), arr.shape
    tmp = path + ".tmp.png"
    Image.fromarray(arr, "RGB").save(tmp)
    subprocess.run(["vips", "copy", tmp, path + "[profile=srgb,compression=9]"], check=True)
    os.remove(tmp)
    return arr


def write_meta(path, meta):
    with open(path, "w") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)


def finish(name, R, A, placed, extra_hairlines=None, meta=None, out_dir=HERE):
    """Imprime as chapas, grava NN-nome.png e o JSON de medidas ao lado, e a previa em tom
    continuo (so para medir a 500 px) em .tmp/."""
    img = print_plates(R, A, halftone=True)
    flat = print_plates(R, A, halftone=False)
    if extra_hairlines:
        img = hairlines(img, extra_hairlines)
        flat = hairlines(flat, extra_hairlines)
    arr = save_png(img, os.path.join(out_dir, name + ".png"))
    os.makedirs(os.path.join(HERE, ".tmp"), exist_ok=True)
    Image.fromarray(np.clip(np.rint(flat), 0, 255).astype(np.uint8), "RGB").save(os.path.join(HERE, ".tmp", name + "-flat.png"))
    m = {"nome": name, "pecas": [p.as_dict() for p in placed if p]}
    m.update(meta or {})
    write_meta(os.path.join(out_dir, name + ".json"), m)
    return arr


# registro das pecas geradas: (modo das chapas, limiares do recorte). Cada fundo gerado tem uma
# luz propria (o piso da torre ambar clareia, o do peao ambar e liso e escuro), entao o limiar
# do recorte e por peca. O resultado e conferido a olho em pecas/recortes/ e no contato.
PIECE_SPECS = {
    "rubro-cavalo": ("rubro", {}),
    "rubro-torre": ("rubro", {}),
    "rubro-bispo": ("rubro", {}),
    "rubro-peao": ("rubro", {}),
    "rubro-dama": ("rubro", {}),
    "ambar-cavalo": ("ambar", {}),
    "ambar-torre": ("ambar", {"thr": 12.0, "thr_y": 999.0, "sym": True}),
    "ambar-peao": ("ambar", {"thr": 3.5, "thr_y": 26.0, "sym": True, "base_extra": 22, "close": 45}),
}


def load_all(names=None, save=True):
    out = {}
    for n, (mode, kw) in PIECE_SPECS.items():
        if names and n not in names:
            continue
        out[n] = load_piece(n, mode, save_dir=os.path.join(PECAS, "recortes") if save else None, **kw)
    return out


def get_pieces():
    """load_all com cache em .tmp/ (a rotulagem em Python puro leva alguns segundos por peca)."""
    import pickle
    os.makedirs(os.path.join(HERE, ".tmp"), exist_ok=True)
    cache = os.path.join(HERE, ".tmp", "pieces.pkl")
    srcs = [os.path.join(PECAS, n + ".png") for n in PIECE_SPECS] + [os.path.abspath(__file__)]
    if os.path.exists(cache) and os.path.getmtime(cache) > max(os.path.getmtime(f) for f in srcs):
        return pickle.load(open(cache, "rb"))
    P = load_all()
    pickle.dump(P, open(cache, "wb"))
    return P


def avatar_clear(bbox, margin=10):
    x0, y0, x1, y1 = bbox
    ax0, ay0, ax1, ay1 = AVATAR
    return not (x1 > ax0 - margin and x0 < ax1 + margin and y1 > ay0 - margin and y0 < ay1 + margin)


def compose(name, proj, light, dark, placements, P=None, hair=None, meta=None, board_kw=None):
    """Tabuleiro (reticula) + pecas na ordem do fundo para a frente. placements: lista de dicts
    {piece, x, y, h, flip}: (x, y) = centro da base em px, h = altura do corpo em px."""
    P = P or get_pieces()
    R, A = board_tones(proj, light, dark, **(board_kw or {}))
    placed = []
    for pl in sorted(placements, key=lambda d: d["y"]):
        pp = place_piece(R, A, P[pl["piece"]], pl["x"], pl["y"], pl["h"], flip=pl.get("flip", False))
        assert avatar_clear(pp.bbox), (name, pl, pp.bbox)
        placed.append(pp)
    m = dict(meta or {})
    m["sonda_500"] = pick_probe(proj, placed)
    return finish(name, R, A, placed, extra_hairlines=hair, meta=m), placed


def pick_probe(proj, placed, rect=AVATAR, min_side=22, ymax=495, xmax=1490, margin=20):
    """Escolhe uma casa clara e uma escura inteiras, livres de peca e longe da foto, para medir a 500 px
    se o tabuleiro continua legivel. Devolve os poligonos (px do banner de 1500)."""
    # intervalo de indices visiveis
    xs = np.linspace(0, W, 40); ys = np.linspace(0, H, 14)
    X, Y = np.meshgrid(xs, ys)
    u, v, ok = proj.inverse(X, Y)
    if not ok.any():
        return None
    i0, i1 = int(np.floor(u[ok].min())), int(np.ceil(u[ok].max()))
    j0, j1 = int(np.floor(v[ok].min())), int(np.ceil(v[ok].max()))
    boxes = [p.bbox for p in placed if p]
    cands = []
    for i in range(i0, i1 + 1):
        for j in range(j0, j1 + 1):
            poly = [proj.forward(i + a, j + b) for a, b in ((0, 0), (1, 0), (1, 1), (0, 1))]
            px = [q[0] for q in poly]; py = [q[1] for q in poly]
            if min(px) < 400 or max(px) > xmax or min(py) < 60 or max(py) > ymax:
                continue
            # a medida usa o interior (50%) da casa: so ele precisa estar livre de peca
            sx0, sx1 = np.mean(px) - (max(px) - min(px)) / 4, np.mean(px) + (max(px) - min(px)) / 4
            sy0, sy1 = np.mean(py) - (max(py) - min(py)) / 4, np.mean(py) + (max(py) - min(py)) / 4
            if any(not (sx1 < b[0] - margin or sx0 > b[2] + margin or sy1 < b[1] - margin or sy0 > b[3] + margin) for b in boxes):
                continue
            if abs((max(py) - min(py))) < min_side or abs(max(px) - min(px)) < min_side:
                continue
            dx = max(rect[0] - max(px), min(px) - rect[2], 0); dy = max(rect[1] - max(py), min(py) - rect[3], 0)
            if np.hypot(dx, dy) < 150:          # fora do anel de casas com ponto reduzido perto da foto
                continue
            cxm, cym = np.array([np.mean(px)]), np.array([np.mean(py)])
            if float(proj.lod(cxm, cym)[0]) < 0.98:   # fora da faixa em que a casa vira tom medio por distancia
                continue
            area = 0.5 * abs(sum(poly[k][0] * poly[(k + 1) % 4][1] - poly[(k + 1) % 4][0] * poly[k][1] for k in range(4)))
            cands.append(((i + j) % 2, area, i, j, poly))
    out = {}
    if not any(t[0] == 0 for t in cands) or not any(t[0] == 1 for t in cands):
        if min_side > 10:
            return pick_probe(proj, placed, rect, min_side - 8, ymax, xmax, margin)
        return pick_probe(proj, placed, rect, 22, 900, 1600, 4) if ymax < 900 else None   # ultimo recurso: casa cortada pelo quadro, mede so a parte visivel
    for par, key in ((0, "clara"), (1, "escura")):
        c = [t for t in cands if t[0] == par]
        if key == "clara":
            best = max(c, key=lambda t: t[1])
            ref = np.mean([q[0] for q in best[4]]), np.mean([q[1] for q in best[4]])
        else:
            best = min(c, key=lambda t: np.hypot(np.mean([q[0] for q in t[4]]) - ref[0], np.mean([q[1] for q in t[4]]) - ref[1]))
        out[key] = {"casa": [best[2], best[3]], "poligono_px": [[round(float(a), 1), round(float(b), 1)] for a, b in best[4]]}
    return out


def ruler_top(x0, x1, step, y=0, long_every=5, short=9, long=16):
    """Regua de fio de cabelo na borda de cima, alinhada as linhas do tabuleiro."""
    hl = []
    k = 0
    x = x0
    while x <= x1:
        hl.append(("line", x, y, x, y + (long if k % long_every == 0 else short)))
        x += step
        k += 1
    return hl
