#!/usr/bin/env python3
"""Monta contato.png (os banners empilhados a 1500 px) e contato-500.png (as reducoes de 500 px),
com a legenda em Inter / JetBrains Mono (fonts/). Renderiza com o Chrome sem cabeca."""
import asyncio, base64, glob, json, os, shutil, subprocess, tempfile, time, urllib.request
import websockets
HERE = os.path.dirname(os.path.abspath(__file__))
LABELS = json.load(open(os.path.join(HERE, "labels.json")))
PORT = 9334

def page(suffix, width, pad, banner_w):
    rows = []
    for key in sorted(LABELS):
        L = LABELS[key]
        rows.append(f'<section><p class="lab"><b>{key[:2]}</b> {key[3:]} <span class="ph">{L["txt"]}</span></p>'
                    f'<img src="{key}{suffix}.png" width="{banner_w}" alt=""></section>')
    return f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
@font-face{{font-family:"Inter";src:url(fonts/inter-latin-wght-normal.woff2) format("woff2");font-weight:100 900}}
@font-face{{font-family:"JetBrains Mono";src:url(fonts/jetbrains-mono-latin-400-normal.woff2) format("woff2");font-weight:400}}
@font-face{{font-family:"JetBrains Mono";src:url(fonts/jetbrains-mono-latin-700-normal.woff2) format("woff2");font-weight:700}}
html,body{{margin:0;background:#18181b}}
body{{width:{banner_w + 2*pad}px;padding:{pad}px;box-sizing:border-box;font-family:"JetBrains Mono",monospace;color:#a1a1aa}}
section{{margin-bottom:{pad}px}}
.lab{{margin:0 0 10px;font-size:{18 if banner_w>1000 else 13}px;line-height:1.3}}
.lab b{{color:#ffb224;font-weight:700}} .ph{{color:#fafafa;font-family:"Inter";font-weight:700;margin-left:10px}}
img{{display:block;outline:1px solid #3f3f46}}
</style></head><body>{''.join(rows)}</body></html>"""

async def shoot(html_path, out, width):
    udd = tempfile.mkdtemp(prefix="contactchrome-", dir=os.path.join(HERE, ".tmp"))
    ch = subprocess.Popen(["google-chrome", "--headless=new", f"--remote-debugging-port={PORT}", f"--user-data-dir={udd}",
        "--force-color-profile=srgb", "--font-render-hinting=none", "--hide-scrollbars", "--no-first-run", "--disable-gpu",
        "--allow-file-access-from-files", f"--window-size={width},800", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(50):
            try: page_t = [t for t in json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json")) if t["type"] == "page"][0]; break
            except Exception: time.sleep(0.2)
        async with websockets.connect(page_t["webSocketDebuggerUrl"], max_size=256 * 2**20) as ws:
            i = 0
            async def call(m, **p):
                nonlocal i; i += 1; mid = i
                await ws.send(json.dumps({"id": mid, "method": m, "params": p}))
                while True:
                    r = json.loads(await ws.recv())
                    if r.get("id") == mid: return r["result"]
            await call("Page.enable")
            await call("Emulation.setDeviceMetricsOverride", width=width, height=800, deviceScaleFactor=1, mobile=False)
            await call("Page.navigate", url="file://" + html_path)
            await asyncio.sleep(1.5)
            await call("Runtime.evaluate", expression="document.fonts.ready.then(()=>1)", awaitPromise=True)
            h = (await call("Runtime.evaluate", returnByValue=True, expression="document.documentElement.scrollHeight"))["result"]["value"]
            await call("Emulation.setDeviceMetricsOverride", width=width, height=h, deviceScaleFactor=1, mobile=False)
            await asyncio.sleep(0.5)
            shot = await call("Page.captureScreenshot", format="png", clip={"x": 0, "y": 0, "width": width, "height": h, "scale": 1})
            open(out, "wb").write(base64.b64decode(shot["data"]))
    finally:
        ch.terminate()
        try: ch.wait(timeout=10)
        except subprocess.TimeoutExpired: ch.kill()
        shutil.rmtree(udd, ignore_errors=True)

def main():
    os.makedirs(os.path.join(HERE, ".tmp"), exist_ok=True)
    for suffix, width, pad, bw, name in (("", 1560, 30, 1500, "contato"), ("-500", 560, 30, 500, "contato-500")):
        hp = os.path.join(HERE, f"_{name}.html"); open(hp, "w").write(page(suffix, width, pad, bw))
        raw = os.path.join(HERE, f".tmp/{name}.raw.png")
        asyncio.run(shoot(hp, raw, width)); os.remove(hp)
        subprocess.run(["vips", "copy", raw, os.path.join(HERE, name + ".png") + "[profile=srgb,compression=9]"], check=True)
        print(subprocess.run(["vipsheader", os.path.join(HERE, name + ".png")], capture_output=True, text=True).stdout.strip())
if __name__ == "__main__": main()
