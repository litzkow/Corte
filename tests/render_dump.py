import asyncio, json, sys, urllib.parse
sys.path.insert(0,'/home/claude/corte/tests')
from harness import ARGS
from playwright.async_api import async_playwright
async def main(qs, out):
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="chrome", headless=True, args=ARGS)
        pg=await b.new_page(); logs=[]
        pg.on("console", lambda m: logs.append(m.text)); pg.on("pageerror", lambda e: logs.append("ERR "+str(e)))
        await pg.goto("http://127.0.0.1:8765/corte/tests/t_render.html?"+qs)
        await pg.wait_for_function("window.__done===true", timeout=600000, polling=1000)
        r=await pg.evaluate("window.__r"); print(json.dumps(r, indent=1, ensure_ascii=False)[:3000]); print(logs[-8:])
        arr=await pg.evaluate("window.__blob||null")
        if arr: open(out,'wb').write(bytes(arr))
        await b.close()
asyncio.run(main(sys.argv[1], sys.argv[2]))
