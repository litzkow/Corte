import asyncio, json, sys
from playwright.async_api import async_playwright
ARGS=["--autoplay-policy=no-user-gesture-required","--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--disable-background-timer-throttling","--disable-renderer-backgrounding","--disable-backgrounding-occluded-windows"]
async def run(page, timeout=300, viewport=None):
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="chrome", headless=True, args=ARGS)
        ctx=await b.new_context(viewport=viewport or {"width":1280,"height":800}, accept_downloads=True)
        pg=await ctx.new_page()
        logs=[]
        pg.on("console", lambda m: logs.append(m.type+": "+m.text))
        pg.on("pageerror", lambda e: logs.append("PAGEERROR: "+str(e)))
        await pg.goto("http://127.0.0.1:8765/corte/tests/"+page)
        try:
            await pg.wait_for_function("window.__done===true", timeout=timeout*1000, polling=500)
        except Exception as e:
            logs.append("TIMEOUT "+str(e)[:200])
        r=await pg.evaluate("window.__r||null")
        await b.close()
        return r, logs
if __name__=="__main__":
    r,logs=asyncio.run(run(sys.argv[1], int(sys.argv[2]) if len(sys.argv)>2 else 300))
    for l in logs[-40:]: print("LOG",l[:400])
    print(json.dumps(r, indent=1, ensure_ascii=False)[:20000])
