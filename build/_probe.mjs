// node build/_probe.mjs id src loa draught bow gd  -- prints clusters in REGION (json) with SIZE
import { prepare } from './kriss-hull.mjs';
import { USN_PAINTS, usnPaint, BOOT } from './kriss-paints.mjs';
const [id, src, loa, dr, bow, gd] = process.argv.slice(2);
const R = JSON.parse(process.env.REGION || '{}');
await prepare({ name: id, script: 'x', src: `assets/models/${src}-maximum-compressed.glb`, out: '/dev/null',
  credit: 'x', loa: +loa, draught: +dr, bow: bow || '+z', groupDepth: +(gd || 2), paints: USN_PAINTS, paint: usnPaint, paintLines: [0, BOOT], deckFallback: 6, hullTris: 60000,
  kinds: { probe: { auto: { regions: [R], size: JSON.parse(process.env.SIZE || '[0.5,12]'), minFaces: +(process.env.MINF || 40), gap: +(process.env.GAP || 0.1) } } } });
