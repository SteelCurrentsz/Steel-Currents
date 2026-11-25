// Napoli off the owner's model of her -- "Napoli" by SB-129
// (https://skfb.ly/oEKqB), under Creative Commons Attribution 4.0, credited
// on the game's Credits screen -- through build/kriss-hull.mjs: her hull, her
// tower, her two funnels and her masts as one mesh, and every mounting of
// hers that trains cut free of her, each as the model drew it: her three
// triple 254 mm, two forward and one aft; her four twin 135 mm, two a side;
// her six 90 mm in their stabilised turrets, three a side; her nine twin
// 37 mm; and her ten twin 20 mm.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-napoli-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { RM_PAINTS, rmPaint, BOOT } from './kriss-paints.mjs';

/** A box round a mounting, as the model's plan of her measures it, with `p` metres to spare all round. */
const box = (x0, x1, y0, y1, z0, z1, p = 0.3) => ({ x: [x0 - p, x1 + p], y: [y0 - p, y1 + p], z: [z0 - p, z1 + p], hullToo: true });
const pair = (x0, x1, y0, y1, z0, z1, p) => [box(x0, x1, y0, y1, z0, z1, p), box(-x1, -x0, y0, y1, z0, z1, p)];

await prepare({
  name: 'Napoli', script: 'build/prepare-napoli-hull.mjs',
  src: 'assets/models/napoli-maximum-compressed.glb',
  out: 'client/js/render/napoliHull.data.js',
  credit: '"Napoli" by SB-129 (https://skfb.ly/oEKqB), CC BY 4.0',
  // 213 m over all, 7.5 m draught.
  loa: 213, draught: 7.5, bow: '+z', groupDepth: 2,
  paints: RM_PAINTS, paint: (f) => (f.up && !f.kind && f.cy > 2 && f.cy < 9 && Math.abs(f.ny) > 0.97 ? 'deck' : rmPaint(f)), paintLines: [0, BOOT],
  deckFallback: 5, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0,
  rigging: { y: 14 },
  kinds: {
    // Her three triple 254 mm: No.1 on her forecastle and No.2 superfiring
    // over it, trained ahead, and No.3 aft, trained astern. No.1 is taken
    // first.
    main: { boxes: [
      box(-4.7, 4.7, 5.6, 8.5, 43.0, 62.0, 0),
      box(-4.7, 4.7, 7.6, 11.7, 28.9, 47.8, 0),
      box(-4.7, 4.7, 5.6, 9.6, -71.8, -52.8, 0),
    ], gun: { whole: true, tris: 3200, error: 0.005, rests: [0, 0, Math.PI] } },
    // Her four twin 135 mm, a pair forward of her tower and a pair aft.
    sec: { boxes: [...pair(4.96, 11.61, 5.26, 7.3, 21.41, 33.82), ...pair(4.52, 11.17, 5.26, 7.3, -57.79, -45.38)],
      gun: { whole: true, tris: 1600, error: 0.008, rests: [0, 0, Math.PI, Math.PI] } },
    // Her six 90 mm in their stabilised turrets, three a side.
    dp: { boxes: [
      ...pair(7.15, 11.55, 5.25, 7.15, 7.38, 12.44),
      ...pair(7.45, 11.85, 5.25, 7.15, -18.27, -13.21),
      ...pair(7.14, 11.54, 5.25, 7.15, -36.43, -31.36),
    ], gun: { whole: true, tris: 1200, error: 0.01 } },
    // Her nine twin 37 mm Breda, on her decks.
    aa2: { boxes: [
      ...pair(2.76, 5.95, 5.14, 7.63, 62.45, 66.72, 0.15),
      ...pair(4.04, 8.32, 6.89, 9.38, 13.72, 16.91, 0.15),
      ...pair(0.52, 4.81, 6.89, 9.38, -39.7, -36.51, 0.15),
      ...pair(2.19, 5.37, 3.08, 5.48, -83.57, -79.29, 0.15),
      box(-1.59, 1.6, 3.26, 5.75, -97.7, -93.43, 0.15),
    ], gun: { whole: true, tris: 900, error: 0.01 } },
    // Her ten twin 20 mm Breda about her superstructure.
    aa3: { boxes: [
      ...pair(3.42, 6.71, 11.17, 13.61, 10.16, 11.67, 0.15),
      ...pair(3.51, 6.15, 13.36, 15.8, -19.08, -16.44, 0.15),
      ...pair(3.51, 6.15, 13.36, 15.8, -24.1, -21.43, 0.15),
      ...pair(1.36, 4.65, 15.49, 17.94, -45.43, -43.92, 0.15),
      ...pair(1.63, 4.93, 9.11, 11.55, -47.05, -45.53, 0.15),
    ], gun: { whole: true, tris: 700, error: 0.01 } },
  },
});
