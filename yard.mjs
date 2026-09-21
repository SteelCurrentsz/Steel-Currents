// Look at one hull, from a bearing you choose.
//
// `shot.mjs` takes a picture of whatever is on the screen; this puts a named
// ship on the water in the yard and walks the camera round her, which is what
// anybody rebuilding a model actually needs. A hull that passes every check in
// the suite can still have her funnels drawn as factory chimneys, and the only
// way to find that out is to look at her.
//
//   node yard.mjs                                 # the Fletcher, from abeam
//   SHIP=Iowa VIEWS='[["bow",2.7,0.3,0.45]]' node yard.mjs
//
// Each view is [name, yaw, pitch, range] -- range as a fraction of the one
// that fits her in the frame -- and FOCUS moves the point the camera looks at
// along her length, so a quarterdeck can be looked at from close to.

import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:8080/';
const SHIP = process.env.SHIP || 'Fletcher';
const OUT = process.env.OUT || 'yard';
const FOCUS = Number(process.env.FOCUS || 0);
const VIEWS = JSON.parse(process.env.VIEWS || '[["beam", 1.5708, 0.06, 0.98]]');

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-sandbox', '--disable-gpu-sandbox'],
});
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(2200);
const guest = await page.$('[data-provider="guest"]');
if (guest) { await guest.click(); await page.waitForTimeout(1200); }
await page.click('[data-action="custom"]');
await page.waitForTimeout(800);
await page.evaluate(() => document.getElementById('ally-add-cell').click());
await page.waitForTimeout(1800);
for (let i = 0; i < 14; i++) {
  if (await page.$eval('#yard-name', (e) => e.textContent.trim()) === SHIP) break;
  await page.evaluate(() => document.getElementById('yard-next').click());
  await page.waitForTimeout(420);
}
await page.waitForTimeout(2200);

for (const [name, yaw, pitch, range] of VIEWS) {
  // The yard looks at her waist; this lets the camera be walked along her, so
  // a forecastle or a quarterdeck can be looked at from twenty metres.
  await page.evaluate(([y, p, r, fz]) => {
    const yard = window.__yard;
    const o = yard.orbit;
    o.yaw = y;
    o.pitch = p;
    o.range = o.target = yard.fitRange() * r;
    yard.ranged = true;
    if (!yard.__walk) {
      yard.__walk = true;
      const base = yard.update.bind(yard);
      yard.update = (dt) => {
        base(dt);
        const fy = yard.ship ? yard.ship.deckY * 0.5 : 4;
        const oo = yard.orbit;
        const cp = Math.cos(oo.pitch);
        const z0 = yard.way + (yard.__focusZ || 0);
        yard.camera.position.set(
          Math.sin(oo.yaw) * cp * oo.range,
          fy + Math.sin(oo.pitch) * oo.range,
          z0 + Math.cos(oo.yaw) * cp * oo.range,
        );
        yard.camera.lookAt(0, fy, z0);
      };
    }
    yard.__focusZ = fz;
  }, [yaw, pitch, range, FOCUS]);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}-${name}.png` });
}

console.log(errors.length ? `ERRORS:\n${errors.slice(0, 12).join('\n')}` : 'no console errors');
await browser.close();
