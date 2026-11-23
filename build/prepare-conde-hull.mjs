// Condé off the owner's model of her -- "Conde" by SB-129
// (https://skfb.ly/oETGR), under Creative Commons Attribution 4.0, credited
// on the game's Credits screen -- through build/kriss-hull.mjs: her hull, her
// tower, her funnel and her masts as one mesh, and every mounting of hers
// that trains cut free of her, each as the model drew it: her three triple
// 240 mm, two forward and one aft; her eight twin 130 mm, four a side; her
// eight twin 100 mm, four a side; and her six twin 37 mm.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-conde-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { MN_PAINTS, mnPaint, BOOT } from './kriss-paints.mjs';

/** A box round a mounting, as the model's plan of her measures it, with `p` metres to spare all round. */
const box = (x0, x1, y0, y1, z0, z1, p = 0.3) => ({ x: [x0 - p, x1 + p], y: [y0 - p, y1 + p], z: [z0 - p, z1 + p], hullToo: true });
const pair = (x0, x1, y0, y1, z0, z1, p) => [box(x0, x1, y0, y1, z0, z1, p), box(-x1, -x0, y0, y1, z0, z1, p)];

await prepare({
  name: 'Conde', script: 'build/prepare-conde-hull.mjs',
  src: 'assets/models/conde-maximum-compressed.glb',
  out: 'client/js/render/condeHull.data.js',
  credit: '"Conde" by SB-129 (https://skfb.ly/oETGR), CC BY 4.0',
  // 228 m over all, 7.5 m draught.
  loa: 228, draught: 7.5, bow: '+z', groupDepth: 2,
  paints: MN_PAINTS, paint: mnPaint, paintLines: [0, BOOT],
  deckFallback: 6, hullTris: 80000,
  rigging: { y: 14 },
  kinds: {
    // Her three triple 240 mm: No.1 on her forecastle and No.2 superfiring
    // over it, trained ahead, and No.3 aft, trained astern. No.1 is taken
    // first.
    main: { boxes: [
      box(-5.1, 5.1, 6.2, 9.45, 53.5, 73.0, 0),
      box(-5.1, 5.1, 8.8, 12.1, 36.1, 55.6, 0),
      box(-5.1, 5.1, 5.85, 9.15, -75.5, -55.9, 0),
    ], gun: { whole: true, tris: 3200, error: 0.005, rests: [0, 0, Math.PI] } },
    // Her eight twin 130 mm: two pairs abreast No.2, trained ahead, and two pairs
    // abreast her after superstructure, trained astern.
    sec: { boxes: [
      ...pair(5.55, 10.18, 5.36, 9.75, 25.0, 33.11),
      ...pair(5.55, 10.18, 5.36, 9.75, 17.52, 24.6),
      ...pair(5.55, 9.68, 6.71, 9.73, -41.05, -33.06),
      ...pair(5.0, 9.13, 5.32, 8.34, -49.75, -41.76),
    ], gun: { whole: true, tris: 1600, error: 0.008, rests: [0, 0, 0, 0, Math.PI, Math.PI, Math.PI, Math.PI] } },
    // Her eight twin 100 mm, four a side on her shelter deck.
    dp: { boxes: [
      ...pair(4.38, 9.41, 9.47, 12.77, 12.81, 16.28),
      ...pair(6.55, 11.58, 9.47, 12.77, 6.27, 9.74),
      ...pair(6.01, 11.03, 9.47, 12.77, -24.18, -20.71),
      ...pair(3.3, 8.32, 9.47, 12.77, -30.71, -27.24),
    ], gun: { whole: true, tris: 1200, error: 0.01 } },
    // Her six twin 37 mm about her superstructure.
    aa2: { boxes: [
      box(-1.35, 1.35, 18.45, 20.85, 19.32, 21.8, 0.15),
      ...pair(4.24, 6.72, 13.62, 16.02, 7.74, 10.44, 0.15),
      ...pair(2.07, 4.55, 13.63, 16.03, -31.42, -28.72, 0.15),
      box(-1.35, 1.35, 11.56, 13.96, -47.68, -45.2, 0.15),
    ], gun: { whole: true, tris: 900, error: 0.01 } },
  },
});
