// RN Trento off the owner's model of her -- "RN Trento (War Thunder)" by
// KojfDiscord (https://skfb.ly/pyzQZ), under Creative Commons Attribution
// 4.0, credited on the game's Credits screen -- through build/kriss-hull.mjs:
// her hull, her tower and tripod, her two funnels and her mainmast as one
// mesh, and every mounting of hers that trains cut free of her, each as the
// model drew it: her four twin 203 mm/50, two forward and two aft; and her
// twin 100 mm/47 on sponsons abreast her funnels.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-trento-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { RM_PAINTS, rmPaint, BOOT } from './kriss-paints.mjs';

const box = (x0, x1, y0, y1, z0, z1) => ({ x: [x0, x1], y: [y0, y1], z: [z0, z1], hullToo: true });
const pair = (x0, x1, y0, y1, z0, z1) => [box(x0, x1, y0, y1, z0, z1), box(-x1, -x0, y0, y1, z0, z1)];

await prepare({
  name: 'Trento', script: 'build/prepare-trento-hull.mjs',
  src: 'assets/models/rn_trento_war_thunder-maximum-compressed.glb',
  out: 'client/js/render/trentoHull.data.js',
  credit: '"RN Trento (War Thunder)" by KojfDiscord (https://skfb.ly/pyzQZ), CC BY 4.0',
  // 196.96 m over all, 6.8 m draught.
  loa: 196.96, draught: 6.8, bow: '+z', groupDepth: 2,
  paints: RM_PAINTS, paint: (f) => (f.up && !f.kind && f.cy > 2 && f.cy < 11 && Math.abs(f.ny) > 0.97 ? 'deck' : rmPaint(f)), paintLines: [0, BOOT],
  deckFallback: 6, hullTris: 80000,
  rigging: { y: 14 },
  kinds: {
    // Her four twin 203 mm/50 Model 1924: No.1 on her forecastle and No.2
    // superfiring over it, trained ahead; No.3 superfiring over No.4 aft,
    // trained astern.
    main: { boxes: [
      box(-3.8, 3.8, 3.2, 11.2, 46.5, 62.0),
      box(-3.8, 3.8, 6.0, 13.8, 37.6, 54.0),
      box(-3.8, 3.8, 6.0, 13.8, -55.0, -41.6),
      box(-3.8, 3.8, 3.2, 11.2, -67.0, -50.0),
    ], gun: { whole: true, tris: 2400, error: 0.005, rests: [0, 0, Math.PI, Math.PI] } },
    // Her twin 100 mm/47 OTO 1928, on sponsons in her side abreast her
    // funnels, one a side forward and one a side aft.
    sec: { boxes: [
      ...pair(6.4, 10.6, 5.6, 9.2, 8.0, 13.6), ...pair(6.4, 10.6, 5.6, 9.2, -21.6, -16.2),
    ], gun: { whole: true, tris: 1400, error: 0.01 } },
  },
});
