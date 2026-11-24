// USS Fargo off the owner's model of her -- "USS Fargo War Thunder" by Jimphf
// (https://skfb.ly/pFCKK), under Creative Commons Attribution 4.0, credited
// on the game's Credits screen -- through build/kriss-hull.mjs: her hull, her
// compact bridge, her single trunked funnel, her masts and her catapults as
// one mesh, and every mounting of hers that trains cut free of her, each as
// the model drew it: her four triple 6-inch/47, two forward and two aft; her
// six twin 5-inch/38; and her quadruple 40 mm Bofors.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-fargo-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { USN_CRUISER_PAINTS, usnCruiserPaint, BOOT } from './kriss-paints.mjs';

const box = (x0, x1, y0, y1, z0, z1) => ({ x: [x0, x1], y: [y0, y1], z: [z0, z1], hullToo: true });
const pair = (x0, x1, y0, y1, z0, z1) => [box(x0, x1, y0, y1, z0, z1), box(-x1, -x0, y0, y1, z0, z1)];

await prepare({
  name: 'Fargo', script: 'build/prepare-fargo-hull.mjs',
  src: 'assets/models/uss_fargo_war_thunder-maximum-compressed.glb',
  out: 'client/js/render/fargoHull.data.js',
  credit: '"USS Fargo War Thunder" by Jimphf (https://skfb.ly/pFCKK), CC BY 4.0',
  // 185.9 m over all (610 ft 1 in), 7.5 m deep.
  loa: 185.9, draught: 7.5, bow: '+z', groupDepth: 2,
  paints: USN_CRUISER_PAINTS, paint: usnCruiserPaint, paintLines: [0, BOOT],
  deckFallback: 6, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0,
  rigging: { y: 14 },
  kinds: {
    // Her four triple 6-inch/47 Mk 16: No.1 and No.2 superfiring forward,
    // trained ahead; No.4 and No.3 superfiring aft, trained astern.
    main: { boxes: [
      box(-5.2, 5.2, 6.2, 9.8, 50.0, 70.0),
      box(-5.2, 5.2, 7.4, 11.4, 38.0, 60.0),
      box(-5.2, 5.2, 6.2, 9.4, -68.0, -48.0),
      box(-5.2, 5.2, 7.4, 11.4, -54.0, -36.0),
    ], gun: { whole: true, tris: 2600, error: 0.005, rests: [0, 0, Math.PI, Math.PI] } },
    // Her six twin 5-inch/38 Mk 32: one on her centreline over No.2 and one
    // over No.3, and two a side abreast her bridge and her after tower.
    sec: { boxes: [
      box(-3.0, 3.0, 7.4, 12.2, 31.5, 40.5),
      ...pair(2.4, 9.6, 8.2, 12.6, 22.4, 31.0),
      ...pair(3.6, 10.6, 6.0, 12.6, -26.0, -17.4),
      box(-3.0, 3.0, 7.4, 12.2, -36.0, -26.0),
    ], gun: { whole: true, tris: 1600, error: 0.01, rests: [0, 0, 0, Math.PI, Math.PI, Math.PI] } },
    // Her quadruple 40 mm Bofors in their tubs, three a side.
    aa4: { boxes: [
      ...pair(4.6, 9.8, 8.4, 12.0, 12.6, 19.6), ...pair(4.6, 9.8, 9.6, 12.6, -0.2, 5.4), ...pair(4.4, 9.8, 8.4, 12.0, -13.4, -8.2),
    ], gun: { whole: true, tris: 1200, error: 0.01 } },
  },
});
