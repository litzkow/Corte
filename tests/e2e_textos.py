import asyncio, sys, json, base64
sys.path.insert(0,'/home/claude/corte/tests')
from harness import ARGS
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="chrome", headless=True, args=ARGS)
        ctx=await b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg=await ctx.new_page(); logs=[]
        pg.on("pageerror", lambda e: logs.append("PAGEERROR "+str(e)))
        await pg.goto("http://127.0.0.1:8765/corte/index.html"); await pg.wait_for_timeout(800)
        await pg.click("#btnNew")
        await pg.set_input_files("#fileIn", ["/home/claude/media/broll.mp4"])
        await pg.wait_for_function("window.__corte.S.sources.length===1", timeout=60000)
        await pg.fill("#aiInput", 'reels de 8 segundos, texto na tela "Dane-se o projeto verão. Agora a meta é ficar forte" com serifa'); await pg.click("#btnSend")
        await pg.wait_for_timeout(400); await pg.wait_for_function("!window.__corte.S.busy && window.__corte.S.versions.length>0", timeout=300000)
        await pg.evaluate("window.__corte.seekTo(2.5)"); await pg.wait_for_timeout(900)
        await pg.screenshot(path="/tmp/tx1.png")
        await pg.evaluate("window.__corte.textSheet()"); await pg.wait_for_timeout(1500)
        await pg.screenshot(path="/tmp/tx2.png")
        await pg.click("#sheetX"); await pg.wait_for_timeout(300)
        for t in ['muda o texto pra papel amassado', 'muda o texto pra contorno branco', 'legenda estilo papel amassado']:
            await pg.fill("#aiInput", t); await pg.click("#btnSend"); await pg.wait_for_timeout(400)
            await pg.wait_for_function("!window.__corte.S.busy", timeout=300000)
            await pg.evaluate("window.__corte.seekTo(2.5)"); await pg.wait_for_timeout(900)
            print(t, '=>', (await pg.inner_text('#reply')).replace('\n',' | ')[:200])
            await pg.screenshot(path=f"/tmp/tx_{t.split()[-1]}.png")
        print(logs)
        await b.close()
asyncio.run(main())
