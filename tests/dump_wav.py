import asyncio, json, sys, wave, struct
sys.path.insert(0,'/home/claude/corte/tests')
from harness import ARGS
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(channel="chrome", headless=True, args=ARGS)
        pg=await b.new_page(); logs=[]
        pg.on("console", lambda m: logs.append(m.text))
        await pg.goto("http://127.0.0.1:8765/corte/tests/t_mix.html")
        await pg.wait_for_function("window.__done===true", timeout=300000)
        r=await pg.evaluate("window.__r"); print(json.dumps(r, indent=1)); print(logs[-5:])
        for k in ['talk','action']:
            arr=await pg.evaluate(f"window.__wav_{k}")
            if not arr: continue
            with wave.open(f'/tmp/mix_{k}.wav','wb') as w:
                w.setnchannels(2); w.setsampwidth(2); w.setframerate(48000); w.writeframes(bytes(arr))
        await b.close()
asyncio.run(main())
