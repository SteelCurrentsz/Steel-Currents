// HMS Vanguard off the owner's model of her -- "Vanguard (World of Warships)"
// by KojfDiscord (https://skfb.ly/pxJ9Q), under Creative Commons Attribution
// 4.0, credited on the game's Credits screen -- through build/kriss-hull.mjs:
// her hull, her tower, her two funnels and her masts as one mesh, and every
// mounting of hers that trains cut free of her, each as the model drew it:
// her four twin 15-inch Mk I*, two forward and two aft; her eight twin
// 5.25-inch, four a side; and her ten sextuple 40 mm Bofors Mk VI.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-vanguard-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { RENOWN_PAINTS, renownPaint, BOOT } from './kriss-paints.mjs';

/** A box round a mounting, as the model's plan of her measures it, with `p` metres to spare all round. */
const box = (x0, x1, y0, y1, z0, z1, p = 0.3) => ({ x: [x0 - p, x1 + p], y: [y0 - p, y1 + p], z: [z0 - p, z1 + p], hullToo: true });
const pair = (x0, x1, y0, y1, z0, z1, p) => [box(x0, x1, y0, y1, z0, z1, p), box(-x1, -x0, y0, y1, z0, z1, p)];

await prepare({
  name: 'Vanguard', script: 'build/prepare-vanguard-hull.mjs',
  src: 'assets/models/vanguard_world_of_warships-maximum-compressed.glb',
  out: 'client/js/render/vanguardHull.data.js',
  credit: '"Vanguard (World of Warships)" by KojfDiscord (https://skfb.ly/pxJ9Q), CC BY 4.0',
  // 248.2 m over all, 10.9 m deep load draught.
  loa: 248.2, draught: 10.9, bow: '+z', groupDepth: 2,
  paints: RENOWN_PAINTS, paint: renownPaint, paintLines: [0, BOOT],
  deckFallback: 7, hullTris: 90000,
  rigging: { y: 16 },
  kinds: {
    // Her four twin 15-inch Mk I*: A on her forecastle and B superfiring
    // over it, trained ahead; X superfiring over Y aft, trained astern. Each
    // low turret is taken first.
    main: { boxes: [
      { ...box(-4.8, 4.8, 5.6, 9.75, 47.4, 69.7, 0), not: [{ x: [-4.2, -1.4], y: [5, 7], z: [58.5, 64.5] }, { x: [1.4, 4.2], y: [5, 7], z: [58.5, 64.5] }] },
      box(-4.8, 4.8, 9.2, 16.3, 34.3, 56.6, 0),
      box(-4.8, 4.8, 5.85, 10.0, -84.6, -62.4, 0),
      box(-4.8, 4.8, 9.3, 13.6, -71.5, -49.3, 0),
    ], gun: { whole: true, tris: 4000, error: 0.004, rests: [0, 0, Math.PI, Math.PI] } },
    // Her eight twin 5.25-inch Mk I, four a side.
    sec: { boxes: [
      ...pair(9.33, 14.54, 5.07, 8.38, 15.15, 20.99),
      ...pair(10.4, 15.62, 7.61, 10.92, 4.34, 10.18),
      ...pair(10.31, 15.52, 7.94, 11.25, -24.93, -19.1),
      ...pair(9.27, 14.49, 5.17, 8.48, -35.84, -30.0),
    ], gun: { whole: true, tris: 1600, error: 0.008 } },
    // Her ten sextuple 40 mm Bofors Mk VI about her superstructure.
    aa2: { boxes: [
      ...pair(4.28, 9.6, 12.69, 16.19, 13.13, 18.11),
      ...pair(4.6, 9.92, 16.02, 19.52, 3.54, 8.53),
      ...pair(4.94, 10.25, 12.71, 16.21, -19.27, -14.29),
      ...pair(2.12, 7.43, 13.26, 16.76, -31.57, -26.59),
      box(-2.49, 2.49, 15.47, 18.97, -42.87, -37.56),
      box(-2.49, 2.49, 6.61, 10.11, -121.55, -116.23),
    ], gun: { whole: true, tris: 1000, error: 0.01 } },
  },
});
