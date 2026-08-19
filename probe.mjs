import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await page.goto('http://localhost:8080/', { waitUntil: 'load' });
await page.waitForTimeout(800);
await page.click('[data-action="custom"]');
await page.click('#custom-start');
await page.waitForTimeout(4000);
const out = await page.evaluate(() => {
  const r = [];
  const battle = window.__battle;
  if (!battle) return 'no battle handle';
  battle.scene.scene.traverse((o) => {
    if (o.visible && o.isSprite) r.push({ t: 'sprite', p: o.position.toArray().map(Math.round), s: o.scale.x, o: o.material.opacity, c: o.material.color.getHexString() });
    if (o.isPoints) r.push({ t: 'points', n: o.geometry.attributes.position.count });
  });
  return r.slice(0, 20);
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
