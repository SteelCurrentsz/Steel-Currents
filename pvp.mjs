import { chromium } from 'playwright';
const SP = process.argv[2];
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-gpu-sandbox'],
});
async function open(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${name} PAGEERROR: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} ${m.text()}`); });
  await page.goto('http://localhost:8080/', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.evaluate((n) => localStorage.setItem('steel-currents:settings', JSON.stringify({ name: n, ship: 'iowa', volume: 0 })), name);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1000);
  return { page, errors };
}
const a = await open('Alpha');
const b = await open('Bravo');

for (const c of [a, b]) {
  await c.page.click('[data-action="pvp"]');
  await c.page.waitForTimeout(300);
  await c.page.click('#pvp-quick');
  await c.page.waitForTimeout(700);
}
// Wait out the lobby clock.
await a.page.waitForTimeout(14000);

const info = async (c) => c.page.evaluate(() => ({
  screen: [...document.querySelectorAll('.screen')].filter((s) => s.classList.contains('active')).map((s) => s.id)[0],
  roster: window.__roster || null,
}));
console.log('A screen', (await info(a)).screen, '| B screen', (await info(b)).screen);

// Both ahead full and shooting toward the enemy line.
for (const c of [a, b]) {
  for (let i = 0; i < 4; i++) { await c.page.keyboard.press('KeyW'); await c.page.waitForTimeout(60); }
}
await a.page.waitForTimeout(30000);
for (const c of [a, b]) {
  await c.page.mouse.move(640, 380);
  await c.page.mouse.down(); await c.page.waitForTimeout(400); await c.page.mouse.up();
}
await a.page.waitForTimeout(6000);
await a.page.screenshot({ path: `${SP}/pvp-a.png` });
await b.page.screenshot({ path: `${SP}/pvp-b.png` });

for (const [n, c] of [['A', a], ['B', b]]) {
  const hud = await c.page.evaluate(() => ({
    name: document.getElementById('own-name').textContent,
    hp: document.getElementById('own-hp-text').textContent,
    speed: document.getElementById('speed-readout').textContent,
    contacts: document.querySelectorAll('.kill-row').length,
  }));
  console.log(n, JSON.stringify(hud));
}
const res = await fetch('http://localhost:8080/api/status').then((r) => r.json());
console.log('rooms:', JSON.stringify(res.rooms));
const errs = [...a.errors, ...b.errors];
console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 10).join('\n') : 'no console errors');
await browser.close();
