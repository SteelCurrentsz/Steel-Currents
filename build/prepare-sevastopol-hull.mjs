// Sevastopol off the owner's model of her -- "Sevastopol (War Thunder)
// Leviathans" by KojfDiscord (https://skfb.ly/pyzRu), under Creative Commons
// Attribution 4.0, credited on the game's Credits screen -- through
// build/kriss-hull.mjs: her hull, her tower, her funnel, her masts and her
// catapults as one mesh, and every mounting of hers that trains cut free of
// her, each as the model drew it: her three triple 305 mm/54, two forward
// and one aft; her four twin 152 mm/57, two a side; her six twin 100 mm/56;
// and her four quadruple 37 mm.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-sevastopol-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { RN_PAINTS, rnPaint, BOOT } from './kriss-paints.mjs';

// The boxes below were measured with her floated 8 m deep; she floats 9.45 m
// deep, 1.45 m lower.
const DY = -1.45;
/** A box round a mounting, as the model's plan of her measures it, with `p` metres to spare all round. */
const box = (x0, x1, y0, y1, z0, z1, p = 0.3) => ({ x: [x0 - p, x1 + p], y: [y0 + DY - p, y1 + DY + p], z: [z0 - p, z1 + p], hullToo: true });
const pair = (x0, x1, y0, y1, z0, z1, p) => [box(x0, x1, y0, y1, z0, z1, p), box(-x1, -x0, y0, y1, z0, z1, p)];

await prepare({
  name: 'Sevastopol', script: 'build/prepare-sevastopol-hull.mjs',
  src: 'assets/models/sevastopol_war_thunder_leviathans-maximum-compressed.glb',
  out: 'client/js/render/sevastopolHull.data.js',
  credit: '"Sevastopol (War Thunder) Leviathans" by KojfDiscord (https://skfb.ly/pyzRu), CC BY 4.0',
  // 250.5 m over all, 9.45 m draught: the Project 69's.
  loa: 250.5, draught: 9.45, bow: '+z', groupDepth: 2,
  paints: RN_PAINTS, paint: rnPaint, paintLines: [0, BOOT],
  deckFallback: 5, hullTris: 90000,
  rigging: { y: 12 },
  kinds: {
    // Her three triple 305 mm/54 MK-15: No.1 on her forecastle and No.2
    // superfiring over it, trained ahead, and No.3 aft, trained astern. No.1
    // is taken first, so No.2 keeps only what stands over its roof.
    main: { boxes: [
      box(-5.5, 5.5, 7.4, 12.97, 59.0, 85.4, 0),
      box(-5.5, 5.5, 10.7, 16.4, 41.2, 67.5, 0),
      box(-5.5, 5.5, 7.6, 13.3, -85.0, -57.6, 0),
    ], gun: { whole: true, tris: 4000, error: 0.004, rests: [0, 0, Math.PI] } },
    // Her four twin 152 mm/57 MK-17, two a side abreast her tower.
    sec: { boxes: [...pair(4.6, 10.2, 9.2, 12.1, 13.6, 26.1), ...pair(8.35, 14.0, 7.2, 10.05, -3.4, 9.05)],
      gun: { whole: true, tris: 1800, error: 0.008 } },
    // Her six twin 100 mm/56 B-54: a pair abreast her tower, a pair abaft her
    // funnel, and two on her centreline superfiring over No.3.
    dp: { boxes: [
      ...pair(3.25, 7.83, 12.44, 14.67, 8.55, 13.21),
      ...pair(2.53, 7.11, 10.12, 12.39, -34.01, -29.34),
      box(-2.29, 2.29, 12.99, 15.26, -52.64, -47.98),
      box(-2.29, 2.29, 11.56, 13.82, -57.59, -52.93),
    ], gun: { whole: true, tris: 1400, error: 0.01, rests: [undefined, undefined, undefined, undefined, Math.PI, Math.PI] } },
    // Her four quadruple 37 mm about her after superstructure.
    aa2: { boxes: [...pair(6.9, 11.2, 9.45, 11.78, -25.34, -20.68, 0.2), ...pair(4.46, 8.76, 9.01, 11.35, -41.16, -36.49, 0.2)],
      gun: { whole: true, tris: 900, error: 0.01 } },
  },
});
