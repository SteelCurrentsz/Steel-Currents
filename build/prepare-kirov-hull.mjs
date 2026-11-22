// Kirov off the owner's model of her sister -- "Soviet Cruiser Voroshilov" by
// kriss50 (https://skfb.ly/ptMsq), under Creative Commons Attribution 4.0,
// credited on the game's Credits screen -- through build/kriss-hull.mjs: her
// hull, her tower bridge, her two funnels, her masts and her catapult as one
// painted mesh, and every mounting of hers that trains cut free of her, each
// as the model drew it: her three triple 180 mm/57, two forward and one aft;
// her six single 100 mm/56 B-34, three a side abreast her after funnel; and
// her two triple banks of 533 mm tubes.
//
//   node build/prepare-kirov-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { RN_PAINTS, rnPaint, BOOT } from './kriss-paints.mjs';

const box = (x0, x1, y0, y1, z0, z1) => ({ x: [x0, x1], y: [y0, y1], z: [z0, z1] });
const pair = (x0, x1, y0, y1, z0, z1) => [box(x0, x1, y0, y1, z0, z1), box(-x1, -x0, y0, y1, z0, z1)];

await prepare({
  name: 'Kirov', script: 'build/prepare-kirov-hull.mjs',
  src: 'assets/models/soviet_cruiser_voroshilov-maximum-compressed.glb',
  out: 'client/js/render/kirovHull.data.js',
  credit: '"Soviet Cruiser Voroshilov" by kriss50 (https://skfb.ly/ptMsq), CC BY 4.0',
  // 191.4 m over all, 6.3 m draught.
  loa: 191.4, draught: 6.3, bow: '+z',
  paints: RN_PAINTS, paint: rnPaint, paintLines: [0, BOOT],
  deckFallback: 6, hullTris: 60000,
  kinds: {
    // Her three triple 180 mm/57 MK-3-180: No.1 on her forecastle and No.2
    // superfiring over it, trained ahead, and No.3 aft, trained astern.
    main: { boxes: [
      box(-4.6, 4.6, 6.0, 11.0, 54.0, 72.0),
      box(-4.6, 4.6, 8.4, 13.2, 42.0, 62.0),
      box(-4.6, 4.6, 5.4, 9.4, -66.0, -48.0),
    ], gun: { whole: true, tris: 2400, error: 0.005, rests: [0, 0, Math.PI] } },
    // Her six single 100 mm/56 B-34, three a side abreast her after funnel.
    sec: { boxes: [...pair(4.2, 9.0, 4.6, 10.8, -16.9, -9.9), ...pair(4.2, 9.0, 4.6, 10.8, -23.7, -16.9), ...pair(4.2, 9.0, 4.6, 10.8, -32.8, -25.9)],
      gun: { whole: true, tris: 1400, error: 0.01 } },
    // Her two triple banks of 533 mm tubes, one a side amidships.
    tubes: { boxes: pair(4.8, 9.0, 5.0, 7.8, -6.8, -0.8), gun: { tubes: 3, tris: 1200, rest: 'axis' } },
  },
});
