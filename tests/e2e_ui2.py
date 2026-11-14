import asyncio, sys, json, base64
sys.path.insert(0,'/home/claude/corte/tests')
from harness import ARGS
from playwright.async_api import async_playwright
REQS=["deixa mais cinematográfico com cara de filme, transições suaves",
 "corta o trecho de 0:03 até 0:05",
 "coloca câmera lenta no final e um freeze no comecinho",
 "legenda estilo hormozi caixa alta, fonte mais grossa e um pouco maior",
 "mais nitidez e zoom lento, segue meu rosto",
 "põe a música começando no refrão e sem música no começo",
 "barra de progresso embaixo",
 "tira os palavrões",
 "não gostei",
 "volta pra anterior",
 "faz um corte de 10 e um de 15 segundos"]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="chrome", headless=True, args=ARGS)
        ctx=await b.new_context(viewport={"width":390,"height":844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
        pg=await ctx.new_page(); logs=[]
        pg.on("pageerror", lambda e: logs.append("PAGEERROR "+str(e)))
        pg.on("console", lambda m: logs.append(m.type+": "+m.text) if m.type=='error' else None)
        await pg.goto("http://127.0.0.1:8765/corte/index.html"); await pg.wait_for_timeout(1000)
        await pg.click("#btnNew")
        await pg.set_input_files("#fileIn", ["/home/claude/media/talk.mp4","/home/claude/media/broll.mp4"])
        await pg.wait_for_function("window.__corte.S.sources.length===2", timeout=60000)
        await pg.set_input_files("#musicIn", ["/home/claude/media/music_clip.mp4"]); await pg.wait_for_timeout(800)
        await pg.fill("#aiInput","edita pra tiktok 15 segundos"); await pg.click("#btnSend")
        await pg.wait_for_timeout(400); await pg.wait_for_function("!window.__corte.S.busy && window.__corte.S.versions.length>0", timeout=300000)
        for r in REQS:
            await pg.fill("#aiInput", r); await pg.click("#btnSend"); await pg.wait_for_timeout(400)
            await pg.wait_for_function("!window.__corte.S.busy", timeout=300000)
            rep=await pg.inner_text("#reply")
            print("»",r,"\n  ",rep.replace("\n"," | ")[:260])
        await pg.screenshot(path="/tmp/m1.png")
        # operações no clipe
        await pg.evaluate("(()=>{const c=window.__corte.S.versions[window.__corte.S.cur].plan.clips[1];window.__corte.seekTo(c.start+c.dur/2)})()"); await pg.wait_for_timeout(300); await pg.click(".tl-clip >> nth=1"); await pg.wait_for_timeout(300)
        tools=await pg.eval_on_selector_all(".tool","e=>e.map(x=>x.innerText)")
        print(tools)
        n0=await pg.evaluate("window.__corte.S.versions.length")
        await pg.click(".tool:has-text('Dividir')"); await pg.wait_for_timeout(1500)
        print("versões", n0, "->", await pg.evaluate("window.__corte.S.versions.length"))
        await pg.screenshot(path="/tmp/m2.png")
        # recarrega e abre projeto salvo
        await pg.wait_for_timeout(1500)
        await pg.reload(); await pg.wait_for_timeout(1500)
        await pg.screenshot(path="/tmp/m3_home.png")
        await pg.click(".proj >> nth=0"); await pg.wait_for_timeout(500)
        await pg.wait_for_function("window.__corte.S.versions.length>0 && !window.__corte.S.busy", timeout=300000); await pg.wait_for_timeout(800)
        print("reaberto:", await pg.evaluate("window.__corte.S.versions.length"), await pg.evaluate("window.__corte.S.sources.length"))
        await pg.screenshot(path="/tmp/m4_reopen.png")
        await pg.click("#btnExport")
        await pg.wait_for_selector("a[download]", timeout=600000)
        print("export:", await pg.inner_text("#sheetContent"))
        href=await pg.get_attribute("a[download]","href")
        data=await pg.evaluate("async u=>{const b=await (await fetch(u)).arrayBuffer();let s='';const a=new Uint8Array(b);for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode.apply(null,a.subarray(i,i+32768));return btoa(s)}", href)
        open("/tmp/ui_export.mp4","wb").write(base64.b64decode(data))
        await pg.screenshot(path="/tmp/m5_export.png")
        print([l for l in logs if '404' not in l])
        await b.close()
asyncio.run(main())
