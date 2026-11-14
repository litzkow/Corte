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
        await pg.goto("http://127.0.0.1:8765/corte/index.html")
        await pg.screenshot(path="/tmp/ui_a_top.png")
        await pg.set_input_files("#fileIn", ["/home/claude/media/talk.mp4","/home/claude/media/broll.mp4"])
        await pg.set_input_files("#musicIn", ["/home/claude/media/music_clip.mp4"])
        await pg.wait_for_function("document.querySelectorAll('#mediaList li').length===2", timeout=60000)
        await pg.fill("#prompt", "Reels de 15 segundos estilo podcast, legenda palavra por palavra e texto em círculo \"SIGA PARA MAIS\"")
        await pg.click("#btnGo")
        await pg.wait_for_selector("#secResult:not([hidden])", timeout=240000)
        await pg.wait_for_function("!window.__corte.S.busy", timeout=240000)
        # cola roteiro para ter legenda
        await pg.click(".tabs button[data-tab=captions]")
        await pg.fill("#tab-captions textarea", "Hoje eu vou te contar a história do maior império que já existiu. Ninguém te conta isso na escola. Em apenas trinta anos ele dominou metade do mundo conhecido. O segredo não era o exército. Era a estrada.")
        await pg.click("text=Sincronizar roteiro")
        await pg.wait_for_timeout(500); await pg.wait_for_function("!window.__corte.S.busy", timeout=240000)
        await pg.evaluate("window.__corte.seekTo(4.2)"); await pg.wait_for_timeout(1500)
        await pg.locator("#versions").scroll_into_view_if_needed()
        await pg.screenshot(path="/tmp/ui_b_player.png")
        await pg.locator(".tabs").scroll_into_view_if_needed()
        await pg.screenshot(path="/tmp/ui_c_tabs.png")
        print(logs)
        await b.close()
asyncio.run(main())
