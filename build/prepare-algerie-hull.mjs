// Algérie off the owner's model of her -- "Algerie (War Thunder) Sky Odyssey"
// by KojfDiscord (https://skfb.ly/pOtYK), under Creative Commons Attribution
// 4.0, credited on the game's Credits screen -- through build/kriss-hull.mjs:
// her hull, her tower, her single funnel, her mainmast and her catapult as one
// mesh, and every mounting of hers that trains cut free of her, each as the
// model drew it: her four twin 203 mm/50, two forward and two aft; and her
// six twin 100 mm/45, three a side.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-algerie-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { MN_PAINTS, mnPaint, BOOT } from './kriss-paints.mjs';

const box = (x0, x1, y0, y1, z0, z1) => ({ x: [x0, x1], y: [y0, y1], z: [z0, z1], hullToo: true });
const pair = (x0, x1, y0, y1, z0, z1) => [box(x0, x1, y0, y1, z0, z1), box(-x1, -x0, y0, y1, z0, z1)];

await prepare({
  name: 'Algerie', script: 'build/prepare-algerie-hull.mjs',
  src: 'assets/models/algerie_war_thunder_sky_odyssey-maximum-compressed.glb',
  out: 'client/js/render/algerieHull.data.js',
  credit: '"Algerie (War Thunder) Sky Odyssey" by KojfDiscord (https://skfb.ly/pOtYK), CC BY 4.0',
  // 186.2 m over all, 6.15 m draught.
  loa: 186.2, draught: 6.15, bow: '+z', groupDepth: 2,
  // Her catapult, swung out over her side, stands the model's middle 1.8 m
  // off her own.
  shiftX: -1.8,
  paints: MN_PAINTS, paint: mnPaint, paintLines: [0, BOOT],
  deckFallback: 6, hullTris: 80000,
  rigging: { y: 14 },
  kinds: {
    // Her four twin 203 mm/50 Model 1924: No.1 on her forecastle and No.2
    // superfiring over it, trained ahead; No.3 superfiring over No.4 aft,
    // trained astern.
    main: { boxes: [
      box(-3.6, 3.6, 5.4, 8.9, 47.0, 62.0),
      box(-3.6, 3.6, 7.0, 11.6, 36.0, 54.0),
      box(-3.6, 3.6, 7.0, 11.6, -46.0, -24.0),
      box(-3.6, 3.6, 5.0, 8.9, -60.0, -38.0),
    ], gun: { whole: true, tris: 2400, error: 0.005, rests: [0, 0, Math.PI, Math.PI],
      // Each turned about the middle of its gunhouse, as the plan of her shows it.
      pivots: [[0, 50.1], [0, 41.4], [0, -33.8], [0, -42.2]] } },
    // Her six twin 100 mm/45 Model 1930, three a side on her shelter deck.
    sec: { boxes: [...pair(6.6, 11.8, 6.0, 10.6, -16.6, -11.0), ...pair(6.6, 11.8, 6.0, 10.6, -9.4, -3.8), ...pair(6.0, 11.4, 6.0, 10.6, 24.6, 31.0)],
      gun: { whole: true, tris: 1400, error: 0.01 } },
  },
});
