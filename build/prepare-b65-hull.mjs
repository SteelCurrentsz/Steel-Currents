// IJN B-65 off the owner's model of her -- "IJN Super heavy Cruiser KUMOTORI
// (くもとり/雲取)" by 全斗焕 (https://skfb.ly/o8RZD), under Creative Commons
// Attribution 4.0, credited on the game's Credits screen -- through
// build/kriss-hull.mjs: her hull, her tower, her funnel, her mainmast and her
// catapult as one mesh, and every mounting of hers that trains cut free of
// her, each as the model drew it: her three triple 31 cm/50, two forward and
// one aft; her six twin 10 cm/65, three a side; and her eighteen triple
// 25 mm.
//
// The model is of the super cruiser the Navy designed in 1941 as the B-65
// and never built, under a name of its own; she sails here as the B-65.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-b65-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { IJN_BB_PAINTS, ijnBBPaint, BOOT } from './kriss-paints.mjs';

/** A box round a mounting, as the model's plan of her measures it, with `p` metres to spare all round. */
const box = (x0, x1, y0, y1, z0, z1, p = 0.3) => ({ x: [x0 - p, x1 + p], y: [y0 - p, y1 + p], z: [z0 - p, z1 + p], hullToo: true });
const pair = (x0, x1, y0, y1, z0, z1, p) => [box(x0, x1, y0, y1, z0, z1, p), box(-x1, -x0, y0, y1, z0, z1, p)];

await prepare({
  name: 'B-65', script: 'build/prepare-b65-hull.mjs',
  src: 'assets/models/ijn_super_heavy_cruiser_kumotori-maximum-compressed.glb',
  out: 'client/js/render/b65Hull.data.js',
  credit: '"IJN Super heavy Cruiser KUMOTORI（くもとり/雲取）" by 全斗焕 (https://skfb.ly/o8RZD), CC BY 4.0',
  // 240 m over all, 8.8 m draught: the design's.
  loa: 240, draught: 8.8, bow: '+z', groupDepth: 2,
  paints: IJN_BB_PAINTS, paint: ijnBBPaint, paintLines: [0, BOOT],
  deckFallback: 5, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0,
  rigging: { y: 14 },
  kinds: {
    // Her three triple 31 cm/50: No.1 on her forecastle and No.2 superfiring
    // over it, trained ahead, and No.3 aft, trained astern. No.1 is taken
    // first.
    main: { boxes: [
      box(-5.1, 5.1, 5.3, 8.85, 54.8, 75.6, 0),
      box(-5.1, 5.1, 7.4, 11.4, 37.9, 58.6, 0),
      // Not the fittings on her quarterdeck under No.3's muzzles.
      { ...box(-5.1, 5.1, 5.3, 8.9, -69.0, -48.4, 0), not: [{ y: [4.5, 6.8], z: [-70, -57] }] },
    ], gun: { whole: true, tris: 3600, error: 0.005, rests: [0, 0, Math.PI] } },
    // Her six twin 10 cm/65 Type 98, three a side amidships.
    sec: { boxes: [
      ...pair(6.1, 12.0, 5.33, 8.8, 16.43, 26.79),
      ...pair(6.1, 12.0, 5.33, 8.8, 4.86, 15.27),
      ...pair(6.1, 12.0, 5.33, 8.8, -10.64, -0.28),
    ], gun: { whole: true, tris: 1600, error: 0.008 } },
    // Her eighteen triple 25 mm Type 96, on her decks and her superstructure.
    aa2: { boxes: [
      box(-1.39, 1.37, 5.2, 7.55, 89.48, 92.34, 0.15),
      ...pair(4.6, 7.86, 5.15, 7.51, 75.97, 79.23, 0.15),
      ...pair(5.91, 9.17, 5.15, 7.51, 49.32, 52.57, 0.15),
      ...pair(4.92, 7.85, 6.97, 9.08, 36.06, 38.99, 0.15),
      ...pair(3.76, 6.34, 7.7, 9.82, 17.79, 20.29, 0.15),
      ...pair(3.76, 7.14, 7.7, 10.58, 8.19, 10.68, 0.15),
      box(-1.39, 1.37, 16.69, 19.04, -45.41, -42.54, 0.15),
      ...pair(7.54, 11.31, 5.16, 8.36, -45.43, -42.65, 0.15),
      ...pair(4.64, 8.03, 5.18, 8.38, -71.39, -67.99, 0.15),
      ...pair(3.99, 7.46, 5.16, 8.36, -107.66, -104.25, 0.15),
    ], gun: { whole: true, tris: 800, error: 0.01 } },
  },
});
