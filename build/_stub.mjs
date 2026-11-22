// node build/_stub.mjs id src loa draught bow
import { prepare } from './kriss-hull.mjs';
import { USN_PAINTS, usnPaint, BOOT } from './kriss-paints.mjs';
const [id, src, loa, dr, bow, gd] = process.argv.slice(2);
const probe = process.env.PROBE;
await prepare({ name: id, script: 'x', src: `assets/models/${src}-maximum-compressed.glb`, out: `/tmp/claude-0/-home-user-Steel-Currents/2f0eca6c-3a79-55d1-8b71-6add5285f718/scratchpad/s/${id}.data.js`,
  credit: 'x', loa: +loa, draught: +dr, bow: bow || '+z', groupDepth: +(gd || 2), paints: USN_PAINTS, paint: usnPaint, paintLines: [0, BOOT], deckFallback: 6, hullTris: 60000, kinds: {} });
