# Teste de ponta a ponta pela interface, como uma pessoa usaria (celular).
import asyncio, sys, json
sys.path.insert(0,'/home/claude/corte/tests')
from harness import ARGS
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="chrome", headless=True, args=ARGS)
        ctx=await b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
        pg=await ctx.new_page(); logs=[]
        pg.on("console", lambda m: logs.append(m.type+": "+m.text)); pg.on("pageerror", lambda e: logs.append("PAGEERROR "+str(e)))
        pg.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto("http://127.0.0.1:8765/corte/index.html")
        await pg.screenshot(path="/tmp/ui_1_home.png", full_page=True)
        await pg.set_input_files("#fileIn", ["/home/claude/media/talk.mp4","/home/claude/media/broll.mp4"])
        await pg.set_input_files("#musicIn", ["/home/claude/media/music_clip.mp4"])
        await pg.wait_for_function("document.querySelectorAll('#mediaList li').length===2", timeout=60000)
        await pg.fill("#prompt", "Reels de 15 segundos estilo podcast, tira os silêncios, legenda palavra por palavra e texto em círculo \"SIGA PARA MAIS\"")
        await pg.click("#btnGo")
        await pg.wait_for_selector("#secResult:not([hidden])", timeout=240000)
        await pg.wait_for_function("!window.__corte.S.busy", timeout=240000)
        await pg.screenshot(path="/tmp/ui_2_result.png", full_page=True)
        # ajuste por texto
        await pg.fill("#adjust", "gostei, mas corta mais rápido e deixa a música mais intensa")
        await pg.click("#btnAdjust")
        await pg.wait_for_timeout(500)
        await pg.wait_for_function("!window.__corte.S.busy", timeout=240000)
        await pg.click(".tabs button[data-tab=timeline]")
        await pg.click(".tl .clip >> nth=2")
        await pg.wait_for_timeout(800)
        await pg.screenshot(path="/tmp/ui_3_timeline.png", full_page=True)
        await pg.click(".tabs button[data-tab=quality]")
        await pg.screenshot(path="/tmp/ui_4_quality.png", full_page=True)
        await pg.click("#btnCapGallery")
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path="/tmp/ui_5_gallery.png")
        await pg.click("#sheetX")
        s=await pg.evaluate("(()=>{const S=window.__corte.S;return {versions:S.versions.map(v=>v.label), cur:S.cur, dur:S.versions[S.cur].plan.duration, qc:S.versions[S.cur].qc.score, said:[...document.querySelectorAll('#understood .row')].map(x=>x.textContent)}})()")
        print(json.dumps(s, ensure_ascii=False, indent=1))
        for l in logs:
            if 'GL Driver' not in l and '404' not in l: print("LOG", l[:300])
        await b.close()
asyncio.run(main())
