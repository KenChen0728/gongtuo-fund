"""產生使用說明的畫面截圖（範例資料，名字都是虛構的）。
用法：在專案資料夾執行 python3 -m http.server 8765，再執行 python3 tools/help_shots.py
改版後整套重跑，圖存到 help/*.webp。"""
import asyncio, io, os
from playwright.async_api import async_playwright
from PIL import Image

URL = os.environ.get('SHOT_URL', 'http://localhost:8765/?demo')
OUT = os.path.join(os.path.dirname(__file__), '..', 'help')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 560}, device_scale_factor=2, has_touch=True, color_scheme='light')
        pg = await ctx.new_page()
        await pg.add_init_script("window.print=()=>{}")
        await pg.goto(URL); await pg.wait_for_timeout(800)
        if await pg.evaluate("document.querySelector('#dlgAlert').open"):
            await pg.check('#alertOk'); await pg.click('#alertGo')
        # 截圖時把範例資料提示和重要提醒收起來，畫面才看得到主要內容
        await pg.add_style_tag(content='#demoBar,#alertBar,#toast{display:none!important}')

        async def shot(name):
            await pg.wait_for_timeout(250)
            png = await pg.screenshot()
            im = Image.open(io.BytesIO(png)).convert('RGB')
            im = im.resize((480, round(im.height * 480 / im.width)), Image.LANCZOS)
            im.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=72, method=6)

        async def go(v):
            await pg.evaluate(f"__app.go('{v}')"); await pg.wait_for_timeout(200)

        await go('set')
        await pg.evaluate("document.querySelector('#sDir').closest('details').open=true; document.querySelector('#sDir').closest('details').scrollIntoView({block:'start'})")
        await shot('set')
        await go('home'); await pg.click('#add'); await shot('dlginv'); await pg.keyboard.press('Escape')
        await go('inv'); await pg.click('[data-sel="i12"]'); await pg.click('[data-sel="i13"]')
        await pg.evaluate("document.querySelector('[data-sel=\"i12\"]').scrollIntoView({block:'center'})"); await shot('merge')
        await pg.click('#selMerge'); await pg.click('#mGo'); await pg.wait_for_timeout(300)   # 建一張還沒印的憑證，列印畫面才有內容
        await go('vou'); await pg.click('#printV'); await shot('print'); await pg.keyboard.press('Escape')
        for v in ['cash', 'staff', 'fee', 'report', 'trash']:
            await go(v); await shot(v)
        await go('set')
        await pg.evaluate("const d=document.querySelector('#backup').closest('details'); d.open=true; d.scrollIntoView({block:'center'})")
        await shot('backup')
        await b.close()

asyncio.run(main())
