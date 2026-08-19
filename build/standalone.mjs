// Builds the standalone single-file game: one HTML document with the client,
// the simulation and the bot captains inlined, hosting its own battle in-tab.
//
//   node build/standalone.mjs   ->  build/steel-currents.html
//
// Nothing is fetched at runtime, so the page runs from a file:// path, a static
// host, or anywhere else that will not let it open a socket.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = (...p) => path.join(ROOT, 'build', ...p);

execFileSync('npx', [
  'esbuild', 'client/js/main.js',
  '--bundle', '--format=iife', '--minify',
  `--outfile=${out('bundle.js')}`, '--log-level=warning',
], { cwd: ROOT, stdio: 'inherit' });

let html = fs.readFileSync(path.join(ROOT, 'client/index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'client/css/style.css'), 'utf8');
const js = fs.readFileSync(out('bundle.js'), 'utf8');

// Drop the two tags that point at files this page will not be able to fetch.
html = html.replace(/\s*<link rel="stylesheet" href="css\/style\.css" \/>/, '');
html = html.replace(/\s*<script type="module" src="js\/main\.js"><\/script>/, '');

// The lobby copy describes finding other captains, which a standalone build
// cannot do. Say what this build actually is.
html = html
  .replace('<h2>Fleet Battle</h2>', '<h2>Skirmish</h2>')
  .replace(
    '<p>Player versus player. Pick a hull, take a side, and fight for the map.</p>',
    '<p>Pick a hull, take a side, and fight an AI fleet for the map.</p>',
  )
  .replace('<span>Battles in progress</span>', '<span>Opposition</span>')
  .replace(
    '<div class="room-list" id="room-list"><p class="muted">No open battles — start one.</p></div>',
    '<div class="room-list" id="room-list"><p class="muted">Four enemy captains, three of your own. ' +
    'Multiplayer needs the battle service — see the repository to run it.</p></div>',
  )
  .replace('<button class="btn" id="pvp-quick">Quick Match</button>',
    '<button class="btn" id="pvp-quick">Put to sea</button>');

// Boot overlay and failure reporting, in the game's own visual language: the
// night-sea ground, the stencil red of the wordmark, the sand of the menu.
// Deliberately single-theme — this is a night sea, so it paints its own ground
// on either host theme rather than borrowing one.
const boot = `
<style>
html, body { background: #05080f; }
#boot {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 1.25rem; background: #05080f; color: #e6cf9c;
  font-family: "Oswald", "Haettenschweiler", "Arial Narrow", sans-serif;
  letter-spacing: 0.22em; text-transform: uppercase;
  transition: opacity .6s ease;
}
#boot[hidden] { display: none; }
#boot.gone { opacity: 0; pointer-events: none; }
#boot .mark { font-size: clamp(1.6rem, 5vw, 2.6rem); color: #c0212c; font-weight: 700; }
#boot .sub  { font-size: .78rem; color: #9aa6b2; letter-spacing: .3em; }
#boot .bar  { width: min(260px, 60vw); height: 2px; background: #16202e; overflow: hidden; }
#boot .bar i { display: block; height: 100%; width: 40%; background: #e2c14f;
  animation: sweep 1.15s ease-in-out infinite; }
@keyframes sweep { 0% { transform: translateX(-105%); } 100% { transform: translateX(305%); } }
@media (prefers-reduced-motion: reduce) {
  #boot .bar i { animation: none; width: 100%; }
  #boot { transition: none; }
}
#boot .fail { max-width: 36ch; text-align: center; text-transform: none;
  letter-spacing: normal; line-height: 1.55; color: #dbe4ec;
  font-family: ui-sans-serif, system-ui, sans-serif; font-size: .9rem; }
</style>
<div id="boot">
  <div class="mark">Steel Currents</div>
  <div class="bar"><i></i></div>
  <div class="sub">Raising steam</div>
</div>
`;

// Set before the bundle runs: ESM import hoisting would otherwise lift the
// client above an assignment made inside a module.
const flag = '<script>globalThis.STEEL_CURRENTS_OFFLINE = true;</script>';

const shell = `
<script>
(function () {
  var boot = document.getElementById('boot');
  function fail(msg) {
    if (!boot) return;
    boot.hidden = false;
    boot.classList.remove('gone');
    boot.innerHTML = '<div class="mark">Steel Currents</div><p class="fail">' + msg + '</p>';
  }
  try {
    var c = document.createElement('canvas');
    if (!(c.getContext('webgl2') || c.getContext('webgl'))) {
      return fail('This browser has no WebGL, which the sea and the ships are drawn with. ' +
        'Chrome, Firefox, Edge and Safari all support it \\u2014 if you are on one of those, ' +
        'hardware acceleration may be switched off in its settings.');
    }
  } catch (e) {
    return fail('WebGL could not start, so the battle cannot be drawn.');
  }
  window.addEventListener('error', function (e) {
    fail('The game failed to start: ' + (e.message || 'unknown error') + '.');
  });
  window.addEventListener('load', function () {
    setTimeout(function () {
      if (boot && !boot.querySelector('.fail')) {
        boot.classList.add('gone');
        setTimeout(function () { boot.hidden = true; }, 650);
      }
    }, 350);
  });
})();
</script>
`;

// Replacer *functions*, not strings: minified Three.js contains `$&` (a `$`
// identifier followed by `&&`), which String.replace would expand as the
// matched text and splice `</body>` into the middle of the bundle.
html = html.replace('</head>', () => `<style>\n${css}\n</style>\n</head>`);
html = html.replace('<body>', () => `<body>\n${boot}`);
html = html.replace('</body>', () => `${shell}${flag}<script>\n${js}\n</script>\n</body>`);

fs.writeFileSync(out('steel-currents.html'), html);
console.log(`build/steel-currents.html — ${Math.round(html.length / 1024)} KB`);
