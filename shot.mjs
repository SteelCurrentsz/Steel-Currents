import { chromium } from 'playwright';
const out = process.argv[2] || 'shot.png';
const wait = Number(process.argv[3] || 2500);
const url = process.argv[4] || 'http://localhost:8080/';
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-gpu-sandbox'],
});
const ctx = await browser.newContext({ viewport: { width: 1600, height: 860 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(wait);
await page.screenshot({ path: out });
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0,12).join('\n') : 'no console errors');
await browser.close();
