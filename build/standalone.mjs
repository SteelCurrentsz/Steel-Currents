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

// The loading screen lives in the page itself now, styled by the game's own
// stylesheet and taken down by the game when the harbour has actually been
// built. What is left here is the part a standalone build alone needs: a check
// that this browser can draw at all, and somewhere for a failure to be said
// before there is any game to say it.
//
// It used to carry its own screen, and that screen hid itself three hundred
// and fifty milliseconds after `load` -- on a timer, with no idea whether the
// game was up. On anything slower than a desktop the curtain came down while
// the harbour was still being built, and the player was left looking at a
// black canvas wondering what had broken. A loading screen that lies about
// being finished is worse than none.
const boot = '<style>html, body { background: #05080f; }</style>';

// Set before the bundle runs: ESM import hoisting would otherwise lift the
// client above an assignment made inside a module.
const flag = '<script>globalThis.STEEL_CURRENTS_OFFLINE = true;</script>';

const shell = `
<script>
(function () {
  function fail(msg) {
    var el = document.getElementById('boot');
    if (!el) return;
    el.classList.remove('gone', 'done');
    el.classList.add('stuck');
    var say = document.getElementById('boot-say');
    if (say) say.textContent = msg;
    var fill = document.getElementById('boot-fill');
    if (fill) fill.style.width = '100%';
  }
  try {
    var c = document.createElement('canvas');
    if (!(c.getContext('webgl2') || c.getContext('webgl'))) {
      return fail('This browser has no WebGL \\u2014 hardware acceleration may be off');
    }
  } catch (e) {
    return fail('WebGL could not start, so the battle cannot be drawn');
  }
  // Only while she is starting.
  //
  // This handler never came off, so anything that threw anywhere -- twenty
  // minutes into an action, in a click handler, in one frame out of a hundred
  // thousand -- pulled the boot screen back over a running battle and told the
  // captain the game had failed to start. It had not: it had started, and it
  // was still running underneath. The curtain was worse than the fault.
  //
  // So it speaks only until the game is up. After that the game reports its
  // own trouble, in a line along the bottom, and carries on: the frame loop
  // asks for the next frame come what may. And the screen itself is taken down
  // by the game when the harbour has been built, never on a timer.
  window.addEventListener('error', function (e) {
    if (window.__title) {
      if (window.console && console.error) console.error('Steel Currents:', e.message || e);
      return;
    }
    fail('Failed to start: ' + (e.message || 'unknown error'));
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
