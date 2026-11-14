# Auditoria de desempenho: mede tarefas longas (>50 ms) na thread principal durante análise, edição, troca de versão e mudanças pequenas.
import asyncio, sys, json, time
sys.path.insert(0,'/home/claude/corte/tests')
from harness import ARGS
from playwright.async_api import async_playwright
MEDIA = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/media/long.mp4'
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="chrome", headless=True, args=ARGS)
        ctx=await b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg=await ctx.new_page(); logs=[]
        pg.on("pageerror", lambda e: logs.append("PAGEERROR "+str(e)))
        await pg.add_init_script("""
          window.__lt = []; window.__mark = 'inicio';
          new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push({ fase: window.__mark, ms: Math.round(e.duration) }); }).observe({ type: 'longtask', buffered: true });
        """)
        await pg.goto("http://127.0.0.1:8765/corte/index.html"); await pg.wait_for_timeout(800)
        async def fase(nome, coro):
            await pg.evaluate(f"window.__mark = {json.dumps(nome)}")
            t0 = time.time(); await coro; dt = time.time() - t0
            lt = await pg.evaluate(f"window.__lt.filter(x => x.fase === {json.dumps(nome)})")
            mem = await pg.evaluate("performance.memory ? Math.round(performance.memory.usedJSHeapSize/1e6) : -1")
            tot = sum(x['ms'] for x in lt); mx = max([x['ms'] for x in lt] or [0])
            print(f"{nome:38s} {dt:6.1f}s  tarefas longas: {len(lt):3d}  soma {tot:6d} ms  maior {mx:5d} ms  heap {mem} MB")
        await pg.click("#btnNew")
        async def add():
            await pg.set_input_files("#fileIn", [MEDIA])
            await pg.wait_for_function("window.__corte.S.sources.length===1", timeout=120000)
        await fase('importar', add())
        await pg.set_input_files("#musicIn", ["/home/claude/media/music_clip.mp4"]); await pg.wait_for_timeout(500)
        async def ask(t):
            await pg.fill("#aiInput", t); await pg.click("#btnSend"); await pg.wait_for_timeout(300)
            await pg.wait_for_function("!window.__corte.S.busy", timeout=900000)
        await fase('primeira edição (analisa + monta)', ask("youtube de 60 segundos estilo podcast, tira os silêncios"))
        await fase('mudança pequena (legenda amarela)', ask("legenda amarela"))
        await fase('mudança de música (mais baixa)', ask("música mais baixa"))
        await fase('desfazer', ask("desfaz"))
        async def play():
            await pg.evaluate("window.__corte.togglePlay()"); await pg.wait_for_timeout(4000); await pg.evaluate("window.__corte.togglePlay()")
        await fase('tocar 4 s', play())
        async def scrub():
            for i in range(30): await pg.evaluate(f"window.__corte.seekTo({i*1.7})"); await pg.wait_for_timeout(60)
            await pg.wait_for_timeout(800)
        await fase('arrastar linha do tempo', scrub())
        vids = await pg.evaluate("document.querySelectorAll('video').length")
        print('elementos de vídeo na página:', vids)
        print([l for l in logs])
        await b.close()
asyncio.run(main())
