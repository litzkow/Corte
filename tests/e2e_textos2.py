import asyncio, sys, base64
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
        await pg.set_input_files("#musicIn", ["/home/claude/media/music_clip.mp4"]); await pg.wait_for_timeout(800)
        await pg.fill("#aiInput", 'reels de 6 segundos, texto "take that chance cause you might grow" palavra por palavra na batida'); await pg.click("#btnSend")
        await pg.wait_for_timeout(400); await pg.wait_for_function("!window.__corte.S.busy && window.__corte.S.versions.length>0", timeout=300000)
        ov = await pg.evaluate("JSON.stringify(window.__corte.S.versions[window.__corte.S.cur].plan.overlays.map(o=>({k:o.kind,s:o.style,b:(o.beats||[]).slice(0,6)})))")
        print(ov)
        for t in ['texto "onde você tá? | chegando | faz 1 hora que você disse isso" em conversa de mensagem', 'tira o texto', 'frase "o plano deu certo" recorte de revista']:
            await pg.fill("#aiInput", t); await pg.click("#btnSend"); await pg.wait_for_timeout(400)
            await pg.wait_for_function("!window.__corte.S.busy", timeout=300000)
            print(t, '=>', (await pg.inner_text('#reply')).replace('\n',' | ')[:160])
        await pg.evaluate("window.__corte.seekTo(2.5)"); await pg.wait_for_timeout(900)
        await pg.screenshot(path="/tmp/tx3.png")
        await pg.evaluate("window.__corte.textSheet()"); await pg.wait_for_timeout(1500)
        await pg.evaluate("document.querySelector('#sheetContent .gal').scrollIntoView()"); await pg.wait_for_timeout(600)
        await pg.screenshot(path="/tmp/tx4.png")
        await pg.click("#sheetX"); await pg.wait_for_timeout(300)
        await pg.click("#btnExport"); await pg.wait_for_selector("#btnStartExport"); await pg.click(".chip:text-is('720p')"); await pg.click(".chip:text-is('24')"); await pg.click("#btnStartExport")
        await pg.wait_for_selector("a[download]", timeout=600000)
        href=await pg.get_attribute("a[download]","href")
        data=await pg.evaluate("async u=>{const b=await (await fetch(u)).arrayBuffer();let s='';const a=new Uint8Array(b);for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode.apply(null,a.subarray(i,i+32768));return btoa(s)}", href)
        open("/tmp/tx_export.mp4","wb").write(base64.b64decode(data))
        print([l for l in logs])
        await b.close()
asyncio.run(main())
