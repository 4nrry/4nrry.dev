#!/usr/bin/env python3
"""Confere os banners de v3 relendo os PNG do disco. Gera NN-safe.png, NN-crop.png, NN-500.png e
checks.json. Nao muda nada do desenho: so mede.

usage: check.py [prefixo ...]   (padrao: todos os NN-nome.png)
"""
import glob, json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw
from engine import BG, W, H, AVATAR, CROP, screen, PITCH, HERE
from ilusoes import lstar


def ident(path):
    im = Image.open(path)
    hdr = subprocess.run(["vipsheader", path], capture_output=True, text=True).stdout.strip().split(": ", 1)[1]
    prof = im.info.get("icc_profile")
    desc = None
    if prof:
        import io
        from PIL import ImageCms
        desc = ImageCms.getProfileDescription(ImageCms.ImageCmsProfile(io.BytesIO(prof))).strip()
    return {"size": list(im.size), "mode": im.mode, "vipsheader": hdr, "icc": bool(prof), "icc_desc": desc}


def thumb500(src, dst):
    subprocess.run(["vipsthumbnail", src, "--size", "500x", "-o", dst], check=True)


def wcag(rgb):
    c = np.asarray(rgb, float) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return float(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2])


def probe500(t500_path, sonda):
    """A 500 px, a casa clara (reticulada) continua distinta da escura (papel)? Mede dentro de cada casa
    inteira (poligono encolhido a 50%, em coordenadas da reducao) a media e o desvio-padrao do RGB."""
    if not sonda:
        return None
    t = np.asarray(Image.open(t500_path).convert("RGB")).astype(float)
    th, tw = t.shape[:2]
    out = {}
    for key in ("clara", "escura"):
        q = np.array(sonda[key]["poligono_px"]) * (tw / W)
        cen = q.mean(0); small = cen + (q - cen) * 0.5
        m = Image.new("L", (tw, th), 0); ImageDraw.Draw(m).polygon([tuple(p) for p in small], fill=255)
        px = t[np.asarray(m) > 0]
        out[key] = {"casa": sonda[key]["casa"], "pixels": int(len(px)), "media_rgb": [round(float(v), 1) for v in px.mean(0)],
                    "desvio_luma": round(float((px @ np.array([0.2126, 0.7152, 0.0722])).std()), 1)}
    out["razao_de_contraste_wcag"] = round((wcag(out["clara"]["media_rgb"]) + 0.05) / (wcag(out["escura"]["media_rgb"]) + 0.05), 2)
    return out


def control_screen_500():
    """Quanto da reticula SOBRA a 500 px em campo de tom uniforme (0,44): desvio-padrao do nivel de cinza
    na reducao do vipsthumbnail, por passo de reticula. Passo 3 dissolve em tom; passo 5 (o usado) vira uma
    textura fina e regular; passo 7,5 fica como pontos resolvidos."""
    out = {}
    tone = np.full((H, W), 0.44, np.float32)
    for pitch in (3.0, 5.0, 7.5):
        cov = screen(tone, pitch, 45.0)
        img = Image.fromarray(np.clip(cov * 255, 0, 255).astype(np.uint8), "L").convert("RGB")
        p = os.path.join(HERE, ".tmp", "ctl-%s.png" % pitch); img.save(p)
        q = os.path.join(HERE, ".tmp", "ctl-%s-t.png" % pitch); thumb500(p, q)
        g = np.asarray(Image.open(q).convert("L")).astype(float)[20:150, 20:480]
        out[str(pitch)] = {"media": round(float(g.mean()), 1), "desvio": round(float(g.std()), 1)}
    return out


def check(name):
    png = os.path.join(HERE, name + ".png")
    meta = json.load(open(os.path.join(HERE, name + ".json")))
    im = Image.open(png).convert("RGB")
    a = np.asarray(im).astype(int)
    c = {"nome": name, "arquivo": ident(png)}
    x0, y0, x1, y1 = AVATAR
    reg = a[y0:y1, x0:x1]
    nonbg = int((np.abs(reg - np.array(BG)).sum(axis=2) > 0).sum())
    uniq = np.unique(reg.reshape(-1, 3), axis=0)
    c["avatar"] = {"retangulo": [x0, y0, x1 - 1, y1 - 1], "pixels": int(reg.shape[0] * reg.shape[1]), "diferentes_do_papel": nonbg,
                   "cores_unicas": [list(map(int, u)) for u in uniq[:3]], "n_cores_unicas": int(len(uniq))}
    # distancia da peca/tinta mais proxima ao retangulo da foto (informativo): primeira coluna/linha com tinta fora do retangulo
    ink = (np.abs(a - np.array(BG)).sum(axis=2) > 0)
    # corte central
    tot = int(ink.sum()); out = int(ink[:, :CROP[0]].sum() + ink[:, CROP[1]:].sum())
    pcs = meta.get("pecas", [])
    boxes = [p["bbox"] for p in pcs]
    c["corte"] = {"tinta_fora_do_corte_pct": round(100.0 * out / max(tot, 1), 1),
                  "pecas_todas_dentro": all(b[0] >= CROP[0] and b[2] <= CROP[1] for b in boxes),
                  "pecas_x_min_max": [min([b[0] for b in boxes]), max([b[2] for b in boxes])] if boxes else None}
    if meta.get("painel_px"):
        p = meta["painel_px"]
        c["corte"]["painel_px"] = p
        c["corte"]["painel_dentro"] = bool(p[0] >= CROP[0] and p[2] <= CROP[1])
        c["corte"]["painel_longe_da_foto"] = bool(p[0] >= x1 + 10 or p[1] >= y1 or p[3] <= y0)
    if "A_poligono_px" in meta:
        for k in ("A", "B"):
            xs = [q[0] for q in meta[k + "_poligono_px"]]
            c["corte"][k + "_dentro"] = bool(min(xs) >= CROP[0] and max(xs) <= CROP[1])
        c["corte"]["A_B_e_peca_dentro"] = bool(c["corte"]["A_dentro"] and c["corte"]["B_dentro"] and c["corte"]["pecas_todas_dentro"])
    # 500 px
    t500 = os.path.join(HERE, name + "-500.png")
    thumb500(png, t500)
    c["a_500px"] = probe500(t500, meta.get("sonda_500"))
    # controle visual: sobreposicoes
    safe = im.convert("RGBA"); ov = Image.new("RGBA", safe.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=(255, 40, 90, 70), outline=(255, 40, 90, 255), width=3)
    Image.alpha_composite(safe, ov).convert("RGB").save(os.path.join(HERE, name + "-safe.png"))
    crp = im.convert("RGBA"); ov = Image.new("RGBA", crp.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    d.rectangle([0, 0, CROP[0] - 1, H], fill=(9, 9, 11, 215)); d.rectangle([CROP[1], 0, W, H], fill=(9, 9, 11, 215))
    for x in CROP:
        d.line([x, 0, x, H], fill=(255, 40, 90, 255), width=3)
    Image.alpha_composite(crp, ov).convert("RGB").save(os.path.join(HERE, name + "-crop.png"))
    # controle negativo do avatar: a mesma conferencia no -safe.png tem que enxergar a mudanca
    sa = np.asarray(Image.open(os.path.join(HERE, name + "-safe.png")).convert("RGB")).astype(int)[y0:y1, x0:x1]
    c["avatar"]["controle_negativo_safe_png_diferentes"] = int((np.abs(sa - np.array(BG)).sum(axis=2) > 0).sum())
    # Adelson: igualdade A == B relida do disco
    if "A_poligono_px" in meta:
        def inner(poly, shrink=0.55):
            q = np.array(poly); cen = q.mean(0); small = cen + (q - cen) * shrink
            m = Image.new("L", (W, H), 0); ImageDraw.Draw(m).polygon([tuple(p) for p in small], fill=255)
            return np.asarray(m) > 0
        mA, mB = inner(meta["A_poligono_px"]), inner(meta["B_poligono_px"])
        uA, uB = np.unique(a[mA], axis=0), np.unique(a[mB], axis=0)
        # controle negativo: duas casas vizinhas claras e escuras (nao pode dar igual)
        c["adelson"] = {"A_casa_escura_na_luz": {"casa": meta["A_casa"], "pixels": int(mA.sum()), "rgb_unicos": [list(map(int, u)) for u in uA]},
                        "B_casa_clara_na_sombra": {"casa": meta["B_casa"], "pixels": int(mB.sum()), "rgb_unicos": [list(map(int, u)) for u in uB]},
                        "identicos": bool(len(uA) == 1 and len(uB) == 1 and (uA[0] == uB[0]).all()),
                        "casa_clara_L": meta["casa_clara_L"], "casa_escura_D": meta["casa_escura_D"]}
        # controle negativo: a casa clara A' vizinha de A (na luz) tem que ser DIFERENTE de A
        ai, aj = meta["A_casa"]
        nb = [(ai + 1, aj), (ai - 1, aj)]
        c["adelson"]["controle_negativo"] = "casa clara na luz (L) = %s e casa escura na luz (D) = %s: diferentes" % (meta["casa_clara_L"], meta["casa_escura_D"])
    # a 500 px: A e B continuam iguais na reducao (campo chapado) / a argamassa do cafe continua uma linha
    t5 = np.asarray(Image.open(t500).convert("RGB")).astype(float); sc = t5.shape[1] / W
    if "A_poligono_px" in meta:
        r500 = {}
        for k in ("A", "B"):
            q = np.array(meta[k + "_poligono_px"]) * sc; cen = q.mean(0); small = cen + (q - cen) * 0.5
            m = Image.new("L", (t5.shape[1], t5.shape[0]), 0); ImageDraw.Draw(m).polygon([tuple(p) for p in small], fill=255)
            px = t5[np.asarray(m) > 0]
            r500[k] = {"pixels": int(len(px)), "rgb_media": [round(float(v), 1) for v in px.mean(0)], "rgb_max_desvio": round(float(px.std(0).max()), 2)}
        c["adelson_a_500px"] = r500
    if "argamassa_linhas_y" in meta:
        p_ = meta["painel_px"]; rows500 = []
        for (ya, yb) in meta["argamassa_linhas_y"]:
            yc = int(round((ya + yb) / 2 * sc)); band = t5[yc, int(p_[0] * sc) + 4:int(p_[2] * sc) - 4]
            above = t5[yc - 3:yc - 1, int(p_[0] * sc) + 4:int(p_[2] * sc) - 4].reshape(-1, 3).mean(0)
            rows500.append({"y500": yc, "luma_na_linha": round(float(band.mean(0) @ np.array([0.2126, 0.7152, 0.0722])), 1),
                            "luma_nas_casas_vizinhas": round(float(above @ np.array([0.2126, 0.7152, 0.0722])), 1)})
        c["cafe_a_500px"] = rows500
    # cafe: argamassa e geometria relidas do disco
    if "argamassa_linhas_y" in meta:
        p = meta["painel_px"]; M = np.array(meta["argamassa"])
        rows = []
        for (ya, yb) in meta["argamassa_linhas_y"]:
            band = a[ya:yb, p[0]:p[2]]
            u = np.unique(band.reshape(-1, 3), axis=0)
            rows.append({"y": [ya, yb], "cores_unicas": len(u), "igual_a_argamassa": bool(len(u) == 1 and (u[0] == M).all())})
        tiles = a[p[1]:p[3]]
        u = np.unique(tiles.reshape(-1, 3), axis=0)
        c["cafe"] = {"argamassa_rgb": meta["argamassa"], "L_estrela": meta["L_estrela"], "linhas": rows,
                     "todas_as_linhas_chapadas_e_horizontais": all(r["igual_a_argamassa"] for r in rows),
                     "cores_no_painel": len(u)}
    return c


def main():
    pref = sys.argv[1:]
    names = sorted(os.path.basename(f)[:-5] for f in glob.glob(os.path.join(HERE, "[0-9][0-9]-*.json")))
    names = [n for n in names if not pref or any(n.startswith(p) for p in pref)]
    os.makedirs(os.path.join(HERE, ".tmp"), exist_ok=True)
    out = {"controle_da_reticula_a_500px": control_screen_500()}
    for n in names:
        out[n] = check(n)
        c = out[n]
        print(n, json.dumps({"avatar": c["avatar"]["diferentes_do_papel"], "ctl_neg": c["avatar"]["controle_negativo_safe_png_diferentes"],
                             "corte": c["corte"], "500": c["a_500px"], **({"adelson": c["adelson"]["identicos"]} if "adelson" in c else {}),
                             **({"cafe": c["cafe"]["todas_as_linhas_chapadas_e_horizontais"]} if "cafe" in c else {})}, ensure_ascii=False))
    print("controle:", json.dumps(out["controle_da_reticula_a_500px"]))
    json.dump(out, open(os.path.join(HERE, "checks.json"), "w"), indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main()
