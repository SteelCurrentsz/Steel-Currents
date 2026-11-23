// San Martín off the owner's model of her -- "San Martín (World of Warships)"
// by KojfDiscord (https://skfb.ly/puRQt), under Creative Commons Attribution
// 4.0, credited on the game's Credits screen -- through build/kriss-hull.mjs:
// her hull, her tower, her two funnels and her masts as one mesh, and every
// mounting of hers that trains cut free of her, each as the model drew it:
// her two triple and two twin 152 mm turrets, two forward and two aft; her
// nine quadruple 40 mm Bofors; and her eight twin 20 mm Oerlikons.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-sanmartin-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { USN_CRUISER_PAINTS, usnCruiserPaint, BOOT } from './kriss-paints.mjs';

/** A box round a mounting, as the model's plan of her measures it, with `p` metres to spare all round. */
const box = (x0, x1, y0, y1, z0, z1, p = 0.3) => ({ x: [x0 - p, x1 + p], y: [y0 - p, y1 + p], z: [z0 - p, z1 + p], hullToo: true });
const pair = (x0, x1, y0, y1, z0, z1, p) => [box(x0, x1, y0, y1, z0, z1, p), box(-x1, -x0, y0, y1, z0, z1, p)];

await prepare({
  name: 'San Martin', script: 'build/prepare-sanmartin-hull.mjs',
  src: 'assets/models/san_martin_world_of_warships-maximum-compressed.glb',
  out: 'client/js/render/sanmartinHull.data.js',
  credit: '"San Martín (World of Warships)" by KojfDiscord (https://skfb.ly/puRQt), CC BY 4.0',
  // 200 m over all, 7 m draught.
  loa: 200, draught: 7, bow: '+z', groupDepth: 2,
  paints: USN_CRUISER_PAINTS, paint: usnCruiserPaint, paintLines: [0, BOOT],
  deckFallback: 6, hullTris: 80000,
  rigging: { y: 14 },
  kinds: {
    // Her four 152 mm turrets, the triples low and the twins over them: No.1 on her forecastle and No.2 superfiring over it,
    // trained ahead; No.3 superfiring over No.4 aft, trained astern. Each low
    // turret is taken first.
    main: { boxes: [
      box(-5.1, 5.1, 5.7, 8.75, 49.9, 62.4, 0),
      box(-4.1, 4.1, 7.5, 11.0, 37.3, 52.0, 0),
      box(-5.1, 5.1, 5.7, 8.75, -62.6, -50.0, 0),
      box(-4.1, 4.1, 7.5, 11.0, -52.0, -37.4, 0),
    ], gun: { whole: true, tris: 2800, error: 0.005, rests: [0, 0, Math.PI, Math.PI] } },
    // Her nine quadruple 40 mm Bofors: one on her forecastle, and four a
    // side about her superstructure.
    aa2: { boxes: [
      box(-1.92, 1.92, 6.9, 10.14, 92.08, 96.3),
      ...pair(4.65, 8.87, 7.63, 10.86, 19.79, 23.62),
      ...pair(4.65, 8.87, 7.63, 10.86, 12.0, 15.83),
      ...pair(5.15, 9.37, 7.63, 10.86, -14.83, -11.0),
      ...pair(5.15, 9.37, 7.63, 10.86, -22.64, -18.81),
    ], gun: { whole: true, tris: 1200, error: 0.008 } },
    // Her eight twin 20 mm Oerlikons about her superstructure.
    aa3: { boxes: [
      ...pair(3.43, 5.16, 9.97, 12.2, 24.13, 25.99, 0.15),
      ...pair(4.02, 5.75, 9.99, 12.22, 16.88, 18.74, 0.15),
      ...pair(2.75, 4.47, 9.99, 12.22, -7.13, -5.28, 0.15),
      ...pair(3.64, 5.37, 9.13, 11.36, -24.99, -23.13, 0.15),
    ], gun: { whole: true, tris: 900, error: 0.01 } },
  },
});
