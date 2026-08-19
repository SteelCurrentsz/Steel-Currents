import { chromium } from 'playwright';
const SP = process.argv[2];
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-gpu-sandbox'],
});
const ctx = await browser.newContext({ viewport: { width: 1600, height: 860 } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:8080/', { waitUntil: 'load' });
await page.waitForTimeout(1500);

await page.click('[data-action="custom"]');
await page.waitForTimeout(400);
// Pick the heavy cruiser then sortie.
await page.click('#custom-ships .ship-card:nth-child(3)');
await page.click('#custom-start');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${SP}/battle1.png` });

// Ahead full, hard a-starboard, look around and open fire.
for (let i = 0; i < 4; i++) { await page.keyboard.press('KeyW'); await page.waitForTimeout(80); }
await page.mouse.move(800, 430);
await page.mouse.move(1100, 470, { steps: 12 });
await page.waitForTimeout(3000);
await page.mouse.down(); await page.waitForTimeout(600); await page.mouse.up();
await page.keyboard.down('KeyD'); await page.waitForTimeout(1200); await page.keyboard.up('KeyD');
await page.waitForTimeout(4000);
await page.screenshot({ path: `${SP}/battle2.png` });

const state = await page.evaluate(() => ({
  hp: document.getElementById('own-hp-text').textContent,
  speed: document.getElementById('speed-readout').textContent,
  heading: document.getElementById('heading-readout').textContent,
  name: document.getElementById('own-name').textContent,
  timer: document.getElementById('battle-timer').textContent,
  score: document.getElementById('score0').textContent + '/' + document.getElementById('score1').textContent,
}));
console.log('HUD:', JSON.stringify(state));

await page.waitForTimeout(6000);
await page.keyboard.press('KeyC');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SP}/battle3.png` });
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0,15).join('\n') : 'no console errors');
await browser.close();
