import asyncio, sys, base64
sys.path.insert(0,'/home/claude/corte/tests')
from harness import ARGS
from playwright.async_api import async_playwright
async def main(page, out):
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="chrome", headless=True, args=ARGS)
        pg=await b.new_page(); logs=[]
        pg.on("console", lambda m: logs.append(m.text)); pg.on("pageerror", lambda e: logs.append("ERR "+str(e)))
        await pg.goto("http://127.0.0.1:8765/corte/tests/"+page)
        await pg.wait_for_function("window.__done===true", timeout=120000)
        u=await pg.evaluate("window.__r.url")
        open(out,'wb').write(base64.b64decode(u.split(',')[1])); print([l for l in logs if 'GL Driver' not in l][-5:])
        await b.close()
asyncio.run(main(sys.argv[1], sys.argv[2]))
