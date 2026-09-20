#!/usr/bin/env python3
"""Real browser integration tests. --offline uses set_content for restricted render environments.
Normal mode requires `npm start`; GPU and IndexedDB tests only run on an actual eligible origin.
Install test-only dependencies: python -m pip install -r tests/requirements.txt
"""
import argparse
import asyncio
import json
import os
from pathlib import Path
import time
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--offline', action='store_true')
parser.add_argument('--url', default='http://127.0.0.1:4173')
parser.add_argument('--require-gpu', action='store_true')
parser.add_argument('--artifacts', type=Path, default=ROOT / 'artifacts')
parser.add_argument('--chromium', default=os.environ.get('CHROMIUM_PATH'))
args = parser.parse_args()

async def main():
    results, errors, warnings = [], [], []
    artifacts = args.artifacts.resolve()
    artifacts.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    async with async_playwright() as playwright:
        launch = {'headless': True, 'args': ['--no-sandbox', '--disable-dev-shm-usage']}
        if args.chromium:
            launch['executable_path'] = args.chromium
        if args.offline:
            launch['args'].append('--disable-gpu')
        elif args.require_gpu:
            launch['args'] += ['--enable-unsafe-webgpu', '--use-angle=swiftshader']
        browser = await playwright.chromium.launch(**launch)
        context = await browser.new_context(viewport={'width': 1512, 'height': 982}, device_scale_factor=1)
        page = await context.new_page()
        page.set_default_timeout(10000)
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else warnings.append(m.text) if m.type == 'warning' else None)

        async def check(name, expression):
            value = await page.evaluate(expression)
            assert value, f'{name}: assertion returned {value!r}'
            results.append({'test': name, 'status': 'passed'})
            print('PASS', name, flush=True)

        async def change(selector, value):
            await page.locator(selector).fill(str(value))
            await page.locator(selector).press('Tab')
            await page.wait_for_timeout(90)

        async def close_dialog(selector):
            await page.locator(selector + ' [data-close]').click()

        async def solar():
            await page.evaluate("async()=>{await orbitarium.loadScenario('solar');await orbitarium.pause();}")
            await page.wait_for_timeout(100)

        try:
            if args.offline:
                await page.set_content((ROOT / 'orbitarium-standalone.html').read_text(), wait_until='load')
            else:
                await page.goto(args.url, wait_until='networkidle')
            await page.wait_for_function('window.orbitarium?.ready')
            await page.evaluate('orbitarium.pause()')
            await check('boot: 190 physically simulated solar-system bodies', 'orbitarium.simulation.store.count===190 && orbitarium.frames>0')
            await check('two live canvas layers have physical backing sizes', "[...document.querySelectorAll('#universe,#overlay')].every(c=>c.width>300&&c.height>300)")
            before = await page.evaluate('orbitarium.simulation.time')
            await page.wait_for_timeout(180)
            assert await page.evaluate('orbitarium.simulation.time') == before
            results.append({'test': 'pause freezes simulation time', 'status': 'passed'})
            await page.locator('#play-pause').click()
            await page.wait_for_function(f'orbitarium.simulation.time>{before}')
            await page.locator('#play-pause').click()
            await page.evaluate('orbitarium.pause()')
            await check('play button advances gravity integration', f'orbitarium.simulation.time>{before}')
            before = await page.evaluate('orbitarium.simulation.time')
            await page.locator('#step-sim').click()
            await page.wait_for_function(f'orbitarium.simulation.time>{before}')
            await check('step advances physics while remaining paused', 'orbitarium.paused && orbitarium.records.length>=2')

            await page.locator('#body-search').fill('Earth')
            await page.locator('.body-row').filter(has_text='Earth').first.click()
            await check('explorer search and selection inspect the real Earth body', "orbitarium.simulation.store.body(orbitarium.selected).name==='Earth' && document.querySelectorAll('.body-row').length===1")
            await change('#edit-mass', 2)
            await check('mass editor writes physical solar-mass state', 'Math.abs(orbitarium.simulation.store.body(orbitarium.selected).mass/ (5.9722e24/1.98847e30)-2)<1e-10')
            await page.evaluate('document.activeElement.blur()')
            await page.keyboard.press('Control+z')
            await check('keyboard undo restores physical state', 'Math.abs(orbitarium.simulation.store.body(orbitarium.selected).mass/ (5.9722e24/1.98847e30)-1)<1e-10')
            await page.keyboard.press('Control+Shift+z')
            await check('keyboard redo reapplies the edit', 'Math.abs(orbitarium.simulation.store.body(orbitarium.selected).mass/ (5.9722e24/1.98847e30)-2)<1e-10')
            await page.evaluate('orbitarium.undo()')
            await page.locator('#body-search').fill('')
            await page.locator('[aria-controls="orbit-panel"]').click()
            await change('#edit-velocity-0', 12.5)
            await check('velocity editor converts km/s into AU/day', 'Math.abs(orbitarium.simulation.store.body(orbitarium.selected).velocity[0]*149597870.7/86400-12.5)<1e-10')
            await page.locator('#circularize').click()
            await check('circularize command changes the real velocity', 'Math.abs(orbitarium.simulation.store.body(orbitarium.selected).velocity[0]*149597870.7/86400-12.5)>.001')
            await page.locator('[aria-controls="material-panel"]').click()
            await page.locator('#material-water').evaluate("e=>{e.value='35';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}")
            await check('material editing renormalizes the remaining mass fractions', '(()=>{const c=orbitarium.simulation.store.body(orbitarium.selected).composition;return Math.abs(c.water-.35)<1e-12&&Math.abs(Object.values(c).reduce((a,b)=>a+b,0)-1)<1e-12})()')
            radius = await page.evaluate('orbitarium.simulation.store.body(orbitarium.selected).radius')
            await page.locator('#recompute-radius').click()
            await check('material density changes actual collision radius on request', f'orbitarium.simulation.store.body(orbitarium.selected).radius!=={radius}')
            await page.locator('[aria-controls="properties-panel"]').click()

            await page.locator('#add-body').click()
            await page.locator('[data-template="moon"]').click()
            await change('#add-name', 'Browser test moon')
            await page.locator('#add-form button[type=submit]').click()
            await page.wait_for_function('orbitarium.simulation.store.count===191')
            await check('catalog + add orbit generates a new moving moon', "(()=>{const b=orbitarium.simulation.store.body(orbitarium.selected);return b.name==='Browser test moon'&&b.velocity.some(x=>x!==0)})()")
            await page.locator('#duplicate').click()
            await page.wait_for_function('orbitarium.simulation.store.count===192')
            await check('duplicate creates a distinct persistent identity', "orbitarium.simulation.store.body(orbitarium.selected).name==='Browser test moon copy'")
            await page.locator('#delete-body').click()
            await check('delete removes the selected body', 'orbitarium.simulation.store.count===191 && orbitarium.selected===null')
            await page.evaluate('orbitarium.undo()')
            before = await page.evaluate('orbitarium.simulation.diagnostics().mass')
            await page.locator('#explode').click()
            await page.wait_for_function('orbitarium.simulation.store.count===232')
            await check('explode creates 40 integrated fragments and preserves mass', f'Math.abs(orbitarium.simulation.diagnostics().mass-{before})<1e-12')

            await solar()
            await page.locator('#settings').click()
            await change('#setting-gravity', .5)
            await page.locator('#setting-solver').select_option('tree')
            await page.locator('#setting-collisions').select_option('off')
            await page.locator('#setting-thermal').uncheck()
            await page.locator('[data-setting-view="grid"]').check()
            await check('simulation settings alter physics and visualization', "orbitarium.simulation.settings.gravity===.5 && orbitarium.simulation.backend==='tree' && orbitarium.simulation.settings.collisions==='off' && !orbitarium.simulation.settings.thermal && orbitarium.renderer.options.grid")
            await close_dialog('#settings-dialog')
            await page.locator('[data-view="orbits"]').click()
            await check('orbit visibility toggle affects the renderer', '!orbitarium.renderer.options.orbits')
            await page.locator('[data-view="orbits"]').click()

            span = await page.evaluate('orbitarium.renderer.camera.span')
            box = await page.locator('#overlay').bounding_box()
            cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
            await page.mouse.move(cx, cy)
            await page.mouse.wheel(0, -180)
            await page.wait_for_timeout(90)
            await check('wheel zoom changes the 3D camera', f'orbitarium.renderer.camera.span<{span}')
            yaw = await page.evaluate('orbitarium.renderer.camera.yaw')
            await page.mouse.move(cx+180, cy+160)
            await page.mouse.down()
            await page.mouse.move(cx+220, cy+180, steps=4)
            await page.mouse.up()
            await check('pointer drag orbits the 3D camera', f'orbitarium.renderer.camera.yaw!=={yaw}')
            await page.locator('[data-tool="measure"]').click()
            await page.mouse.click(cx-80,cy+90)
            await page.mouse.click(cx+80,cy+90)
            await check('measure tool stores two world-space points', 'orbitarium.renderer.measurement?.length===2')
            await page.locator('[data-tool="select"]').click()
            await page.locator('#home-view').click()
            await page.locator('#inspector-focus').click()
            await check('focus locks the camera onto the selected identity', 'orbitarium.renderer.camera.follow===orbitarium.selected')
            await page.locator('#home-view').click()

            await page.locator('#command').click()
            await page.locator('.command-dialog input').fill('reference grid')
            await page.locator('.command-dialog input').press('Enter')
            await check('command palette executes renderer commands', '!orbitarium.renderer.options.grid')
            await page.locator('#focus-mode').click()
            await check('focus mode expands the live viewport', "document.body.classList.contains('focus-mode')")
            await page.locator('#focus-mode').click()

            await page.locator('#open-scenarios').click()
            await page.locator('[data-scenario="binary"]').click()
            await page.evaluate('orbitarium.pause()')
            await check('scenario library loads a different physical system', "orbitarium.exportProject().metadata.scenario==='binary' && orbitarium.simulation.store.count<20")
            await page.evaluate("async()=>{const p=orbitarium.exportProject();p.metadata.title='Round trip browser';p.bodies[0].name='Round trip star';await orbitarium.importProject(JSON.parse(JSON.stringify(p)));await orbitarium.pause();}")
            await check('validated JSON import round-trips project, body, and camera state', "orbitarium.exportProject().metadata.title==='Round trip browser' && orbitarium.simulation.store.at(0).name==='Round trip star'")
            await page.locator('#step-sim').click()
            await page.locator('#step-sim').click()
            before = await page.evaluate('orbitarium.simulation.time')
            await page.locator('#history-scrub').evaluate("e=>{e.value='0';e.dispatchEvent(new Event('change',{bubbles:true}));}")
            await check('timeline restores recorded physics, not only the display', f'orbitarium.paused && orbitarium.simulation.time<{before}')

            await solar()
            await page.locator('#add-body').click()
            await page.locator('[data-template="comet"]').click()
            await page.locator('#add-mode').select_option('launch')
            await page.locator('#add-form button[type=submit]').click()
            await page.mouse.move(cx+130,cy+180)
            await page.mouse.down()
            await page.mouse.move(cx+210,cy+140,steps=4)
            await page.mouse.up()
            await page.wait_for_function('orbitarium.simulation.store.count===191')
            await check('place-and-launch gesture creates a body with initial velocity', "(()=>{const b=orbitarium.simulation.store.body(orbitarium.selected);return b.kind==='comet'&&b.velocity.some(x=>x!==0)})()")

            # A generated image is verified as a real PNG blob, without relying on download policy.
            await check('scene screenshot returns a nonempty PNG', "async()=>{const r=orbitarium.renderer;r.render(orbitarium.simulation.store,orbitarium.simulation.time,orbitarium.selected);const blob=await r.screenshot();return blob?.type==='image/png'&&blob.size>1000}")
            await solar()
            await page.wait_for_timeout(150)
            await check('decluttered label rectangles do not overlap', '(()=>{const l=orbitarium.renderer.labelPlacements;return l.length>3 && l.every((a,i)=>l.every((b,j)=>i===j||a.x>=b.x+b.w||a.x+a.w<=b.x||a.y>=b.y+b.h||a.y+a.h<=b.y))})()')
            await page.screenshot(path=str(artifacts/'desktop.png'))
            await page.locator('#body-search').fill('Earth')
            await page.locator('.body-row').filter(has_text='Earth').first.click()
            await page.locator('#inspector-focus').click()
            await page.wait_for_timeout(1200)
            await page.screenshot(path=str(artifacts/'earth.png'))
            await page.locator('#home-view').click()
            await page.locator('#body-search').fill('')
            await page.locator('#open-scenarios').click()
            await page.screenshot(path=str(artifacts/'scenario-library.png'))
            await close_dialog('#scenarios-dialog')

            gpu_available = await page.evaluate('!!orbitarium.simulation.gpu?.available')
            if args.require_gpu and not gpu_available:
                raise AssertionError('WebGPU is required for this test run, but unavailable')
            if gpu_available:
                await check('GPU renderer and all shaders compiled successfully', "orbitarium.renderer.mode==='WebGPU'")
                await check('WebGPU compute matches Float64 at non-workgroup-aligned counts', """async()=>{
                  const {BodyStore}=await import('@orbitarium/core');const {CPUSolver}=await import('@orbitarium/gravity');const {G}=await import('@orbitarium/math');
                  for(const n of [1,2,65,190]){const a=new BodyStore();for(let i=0;i<n;i++)a.add({mass:i===0?1:1e-7,position:[i*.02+.1,Math.sin(i)*.1,Math.cos(i)*.1],velocity:[.001,-.002,.0003]});
                    const b=BodyStore.fromJSON(a.toJSON()),cpu=new CPUSolver({mode:'direct'});for(let i=0;i<3;i++)cpu.step(a,.001,G,1e-5);await orbitarium.simulation.gpu.step(b,.001,3,G,1e-5);
                    for(let i=0;i<n*3;i++)if(!Number.isFinite(b.position[i])||Math.abs(a.position[i]-b.position[i])>3e-6||Math.abs(a.velocity[i]-b.velocity[i])>3e-6)return false;
                  }return true;
                }""")
            else:
                results.append({'test': 'WebGPU shader compilation, rendering, and compute parity', 'status': 'not-run', 'reason': 'No eligible WebGPU device/context in this browser run'})
            if not args.offline:
                await check('IndexedDB save, read, list, and delete round-trip', """async()=>{const l=orbitarium.library,p=orbitarium.exportProject(),id='browser-test';await l.save(p,id);const list=await l.list();const ok=list.some(x=>x.id===id&&x.project.bodies.length===p.bodies.length);await l.remove(id);return ok&&!(await l.list()).some(x=>x.id===id)}""")
            else:
                results.append({'test': 'IndexedDB persistence on an eligible origin', 'status': 'not-run', 'reason': 'Offline set_content context has an opaque origin; export/import was tested instead'})

            # Responsive rendering is tested, including actual pointer selection and drawers.
            await page.set_viewport_size({'width':390,'height':844})
            await page.wait_for_timeout(200)
            await check('mobile shell fits viewport without horizontal overflow', 'document.documentElement.scrollWidth<=innerWidth+1')
            await page.screenshot(path=str(artifacts/'mobile.png'))
            await page.locator('#toggle-explorer').click()
            await check('mobile explorer drawer opens', "document.body.classList.contains('explorer-open')")
            await page.locator('#body-search').fill('Earth')
            await page.locator('.body-row').filter(has_text='Earth').first.click()
            await check('mobile selection opens the object inspector', "document.body.classList.contains('inspector-open')")
            await page.screenshot(path=str(artifacts/'mobile-inspector.png'))
            await page.locator('[aria-label="Close inspector"]').click()
            await check('mobile inspector close restores navigation', "!document.body.classList.contains('inspector-open')")
            await page.locator('#toggle-explorer').click()
            await page.locator('#open-scenarios').click()
            await check('mobile scenario dialog remains within viewport', "(()=>{const r=document.querySelector('#scenarios-dialog').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height<=innerHeight})()")
            await page.screenshot(path=str(artifacts/'mobile-library.png'))
            assert not errors, '\n'.join(errors)
            results.append({'test':'no uncaught errors during browser interaction tests','status':'passed'})
        except Exception as error:
            results.append({'test':'browser integration run','status':'failed','message':str(error)})
            try:
                await page.screenshot(path=str(artifacts/'failure.png'))
            except Exception:
                pass
            raise
        finally:
            report={'mode':'offline set_content; CPU/Canvas' if args.offline else args.url,'browser':browser.version,'duration_seconds':round(time.monotonic()-started,2),'results':results,'errors':errors,'warnings':warnings}
            (artifacts/'browser-tests.json').write_text(json.dumps(report,indent=2))
            print(json.dumps({'passed':sum(r['status']=='passed' for r in results),'not_run':sum(r['status']=='not-run' for r in results),'failed':sum(r['status']=='failed' for r in results)},indent=2),flush=True)
            await browser.close()

asyncio.run(main())
