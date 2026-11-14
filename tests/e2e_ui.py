import asyncio, sys, json
sys.path.insert(0,'/home/claude/corte/tests')
from harness import ARGS
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="chrome", headless=True, args=ARGS)
        ctx=await b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg=await ctx.new_page(); logs=[]
        pg.on("pageerror", lambda e: logs.append("PAGEERROR "+str(e)))
        pg.on("console", lambda m: logs.append(m.type+": "+m.text) if m.type=='error' else None)
        await pg.goto("http://127.0.0.1:8765/corte/index.html")
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path="/tmp/n1_home.png")
        await pg.click("#btnNew")
        await pg.set_input_files("#fileIn", ["/home/claude/media/talk.mp4","/home/claude/media/broll.mp4"])
        await pg.wait_for_function("window.__corte.S.sources.length===2", timeout=60000)
        await pg.set_input_files("#musicIn", ["/home/claude/media/music_clip.mp4"])
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path="/tmp/n2_empty.png")
        await pg.fill("#aiInput", "reels de 20 segundos estilo podcast, tira os silêncios, manchete \"O MAIOR SEGREDO\" e barra de progresso")
        await pg.click("#btnSend")
        await pg.wait_for_timeout(800)
        await pg.screenshot(path="/tmp/n3_busy.png")
        await pg.wait_for_function("!window.__corte.S.busy && window.__corte.S.versions.length>0", timeout=300000)
        await pg.wait_for_timeout(800)
        await pg.screenshot(path="/tmp/n4_editor.png")
        # seleciona um corte
        await pg.click(".tl-clip >> nth=1"); await pg.wait_for_timeout(600)
        await pg.screenshot(path="/tmp/n5_sel.png")
        await pg.click(".tool >> nth=0"); await pg.wait_for_timeout(300)
        # ajuste por texto com erro
        await pg.fill("#aiInput", "a musica ta muito alta e a legenda amarela"); await pg.click("#btnSend")
        await pg.wait_for_timeout(500); await pg.wait_for_function("!window.__corte.S.busy", timeout=300000); await pg.wait_for_timeout(500)
        await pg.screenshot(path="/tmp/n6_reply.png")
        # folhas
        for name in ['aiSheet','captionsSheet','colorSheet','audioSheet','textSheet']:
            await pg.evaluate(f"window.__corte.{name}()"); await pg.wait_for_timeout(1200)
            await pg.screenshot(path=f"/tmp/n_sheet_{name}.png")
            await pg.click("#sheetX"); await pg.wait_for_timeout(300)
        # não entendido
        await pg.fill("#aiInput", "qual a previsão do tempo"); await pg.click("#btnSend"); await pg.wait_for_timeout(700)
        await pg.screenshot(path="/tmp/n7_nao.png")
        print(json.dumps(await pg.evaluate("window.__corte.S.versions.map(v=>v.label)"), ensure_ascii=False))
        print([l for l in logs if '404' not in l and 'TUNNEL' not in l])
        await b.close()
asyncio.run(main())
