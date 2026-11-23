// Chapayev off the owner's model of her -- "Chapayev (War Thunder)" by
// KojfDiscord (https://skfb.ly/pz8ME), under Creative Commons Attribution
// 4.0, credited on the game's Credits screen -- through build/kriss-hull.mjs:
// her hull, her tower, her two funnels and her masts as one mesh, and every
// mounting of hers that trains cut free of her, each as the model drew it:
// her four triple 152 mm/57, two forward and two aft; her four twin 100 mm/70
// SM-5-1, two a side amidships; and her fourteen twin 37 mm V-11.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-chapayev-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { RN_PAINTS, rnPaint, BOOT } from './kriss-paints.mjs';

/** A box round a mounting, as the model's plan of her measures it, with `p` metres to spare all round. */
const box = (x0, x1, y0, y1, z0, z1, p = 0.3) => ({ x: [x0 - p, x1 + p], y: [y0 - p, y1 + p], z: [z0 - p, z1 + p], hullToo: true });
const pair = (x0, x1, y0, y1, z0, z1, p) => [box(x0, x1, y0, y1, z0, z1, p), box(-x1, -x0, y0, y1, z0, z1, p)];

await prepare({
  name: 'Chapayev', script: 'build/prepare-chapayev-hull.mjs',
  src: 'assets/models/chapayev_war_thunder-maximum-compressed.glb',
  out: 'client/js/render/chapayevHull.data.js',
  credit: '"Chapayev (War Thunder)" by KojfDiscord (https://skfb.ly/pz8ME), CC BY 4.0',
  // 199 m over all, 6.9 m draught.
  loa: 199, draught: 6.9, bow: '+z', groupDepth: 2,
  paints: RN_PAINTS, paint: rnPaint, paintLines: [0, BOOT],
  deckFallback: 6, hullTris: 80000,
  rigging: { y: 14 },
  kinds: {
    // Her four triple 152 mm/57 MK-5-bis: No.1 on her forecastle and No.2
    // superfiring over it, trained ahead; No.3 superfiring over No.4 aft,
    // trained astern. Each low turret is taken first.
    main: { boxes: [
      // Not the fittings on her forecastle under No.1's muzzles.
      { ...box(-4.6, 4.6, 7.2, 11.1, 59.9, 74.6, 0), not: [{ y: [6, 8.2], z: [69.2, 76] }] },
      box(-4.6, 4.6, 9.6, 14.5, 47.3, 62.0, 0),
      box(-4.6, 4.6, 5.4, 9.2, -69.5, -54.8, 0),
      box(-4.6, 4.6, 7.8, 12.6, -56.6, -41.9, 0),
    ], gun: { whole: true, tris: 2600, error: 0.005, rests: [0, 0, Math.PI, Math.PI] } },
    // Her four twin 100 mm/70 SM-5-1, two a side amidships.
    sec: { boxes: [...pair(4.64, 10.34, 7.46, 11.31, -9.14, -1.95), ...pair(4.64, 10.34, 7.46, 11.3, -27.12, -18.16)],
      gun: { whole: true, tris: 1600, error: 0.008 } },
    // Her fourteen twin 37 mm V-11: eight round her tower, six aft.
    aa2: { boxes: [
      ...pair(5.5, 8.55, 6.95, 9.2, 33.6, 36.45, 0.15),
      ...pair(5.5, 8.55, 6.95, 9.2, 29.35, 32.2, 0.15),
      ...pair(5.5, 8.55, 6.95, 9.2, 25.25, 28.1, 0.15),
      ...pair(5.5, 8.55, 6.95, 9.2, 20.9, 23.8, 0.15),
      ...pair(4.05, 6.8, 7.2, 9.45, -29.1, -26.25, 0.15),
      ...pair(4.05, 6.8, 7.2, 9.45, -33.3, -30.45, 0.15),
      ...pair(0.5, 3.2, 10.2, 12.45, -37.85, -34.95, 0.15),
    ], gun: { whole: true, tris: 900, error: 0.01 } },
  },
});
