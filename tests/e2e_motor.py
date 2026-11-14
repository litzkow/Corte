# Teste de ponta a ponta do motor novo: pedido composto, trechos, música da biblioteca, limpeza de ruído,
# perguntas, comando ensinado, fila de pedidos e exportação conferida (imagem e som).
import asyncio, sys, json, base64, subprocess
sys.path.insert(0,'/home/claude/corte/tests')
from harness import ARGS
from playwright.async_api import async_playwright
async def export(pg, path):
    await pg.click("#btnExport"); await pg.wait_for_selector("#btnStartExport"); await pg.click(".chip:text-is('720p')"); await pg.click(".chip:text-is('24')"); await pg.click("#btnStartExport"); await pg.wait_for_selector("a[download]", timeout=900000)
    href = await pg.get_attribute("a[download]","href")
    data = await pg.evaluate("async u=>{const b=await (await fetch(u)).arrayBuffer();let s='';const a=new Uint8Array(b);for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode.apply(null,a.subarray(i,i+32768));return btoa(s)}", href)
    open(path,"wb").write(base64.b64decode(data)); await pg.click("#sheetX"); await pg.wait_for_timeout(300)
async def ask(pg, t):
    await pg.fill("#aiInput", t); await pg.click("#btnSend"); await pg.wait_for_timeout(300)
    await pg.wait_for_function("!window.__corte.S.busy && !window.__corte.S.queue.length", timeout=900000); await pg.wait_for_timeout(300)
    return (await pg.inner_text('#reply')).replace('\n', ' | ')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", headless=True, args=ARGS)
        ctx = await b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = await ctx.new_page(); logs = []
        pg.on("pageerror", lambda e: logs.append("PAGEERROR "+str(e)))
        await pg.goto("http://127.0.0.1:8765/corte/index.html"); await pg.wait_for_timeout(800)
        await pg.click("#btnNew")
        await pg.set_input_files("#fileIn", ["/home/claude/media/talk_noisy.mp4", "/home/claude/media/broll.mp4"])
        await pg.wait_for_function("window.__corte.S.sources.length===2", timeout=60000)
        await pg.set_input_files("#musicIn", ["/home/claude/media/music_clip.mp4"]); await pg.wait_for_timeout(600)
        await pg.set_input_files("#musicIn", ["/home/claude/media/calma.wav"]); await pg.wait_for_timeout(600)
        print('biblioteca:', await pg.evaluate("window.__corte.S.library.map(x=>x.name)"))
        r = await ask(pg, 'reels de 12 segundos, VHS no começo e preto e branco no final, um boom no começo, música calma')
        print('1 →', r[:400])
        print('   música:', await pg.evaluate("window.__corte.S.music && window.__corte.S.music.name"))
        await export(pg, '/tmp/m_a.mp4')
        r = await ask(pg, 'tira o ruído de fundo e deixa minha voz mais clara')
        print('2 →', r[:300])
        await export(pg, '/tmp/m_b.mp4')
        print('3 →', (await ask(pg, 'o que você fez?'))[:300])
        print('4 →', (await ask(pg, 'quando eu disser "turbo" quer dizer cortes bem rápidos e tremor'))[:200])
        print('5 →', (await ask(pg, 'deixa turbo'))[:300])
        # fila: dois pedidos seguidos sem esperar
        await pg.fill("#aiInput", "música mais baixa"); await pg.click("#btnSend"); await pg.wait_for_timeout(150)
        await pg.fill("#aiInput", "legenda maior"); await pg.click("#btnSend")
        await pg.wait_for_timeout(500); await pg.wait_for_function("!window.__corte.S.busy && !window.__corte.S.queue.length", timeout=900000)
        print('6 → versões:', await pg.evaluate("window.__corte.S.versions.map(v=>v.label).slice(-3)"))
        await pg.evaluate("window.__corte.diagnosticsSheet && window.__corte.diagnosticsSheet()"); await pg.wait_for_timeout(800)
        await pg.screenshot(path='/tmp/diag.png')
        print('erros:', logs)
        await b.close()
asyncio.run(main())
