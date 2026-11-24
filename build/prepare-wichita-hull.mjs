// USS Wichita off the owner's model of her -- "USS Wichita WoWS" by Jimphf
// (https://skfb.ly/pGVpu), under Creative Commons Attribution 4.0, credited
// on the game's Credits screen -- through build/kriss-hull.mjs: her hull, her
// bridge, her two funnels, her masts, her catapults and crane as one mesh,
// and every mounting of hers that trains cut free of her, each as the model
// drew it: her three triple 8-inch/55 turrets, two forward and one aft; and
// her eight single 5-inch/38, four a side on her main deck.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-wichita-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { USN_CRUISER_PAINTS, usnCruiserPaint, BOOT } from './kriss-paints.mjs';

const five = (x, z, y = [5.4, 10.0]) => ({ x: x > 0 ? [x - 3.2, x + 3.0] : [x - 3.0, x + 3.2], y, z: [z - 3.6, z + 3.6], hullToo: true });

await prepare({
  name: 'Wichita', script: 'build/prepare-wichita-hull.mjs',
  src: 'assets/models/uss_wichita_wows-maximum-compressed.glb',
  out: 'client/js/render/wichitaHull.data.js',
  credit: '"USS Wichita WoWS" by Jimphf (https://skfb.ly/pGVpu), CC BY 4.0',
  // 185.4 m over all (608 ft 4 in), 7.2 m deep.
  loa: 185.4, draught: 7.2, bow: '+z', groupDepth: 2,
  paints: USN_CRUISER_PAINTS, paint: usnCruiserPaint, paintLines: [0, BOOT],
  deckFallback: 6, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0,
  rigging: { y: 14 },
  kinds: {
    // Her three triple 8-inch/55 Mk 12: No.1 on her forecastle and No.2
    // superfiring over it, trained ahead, and No.3 aft, trained astern.
    main: { boxes: [
      { x: [-5.2, 5.2], y: [6.8, 10.4], z: [40.0, 64.0] },
      { x: [-5.2, 5.2], y: [8.6, 12.8], z: [29.0, 55.0] },
      { x: [-5.2, 5.2], y: [6.6, 10.6], z: [-64.0, -46.0] },
    ], hullToo: true, gun: { whole: true, tris: 3000, error: 0.005, rests: [0, 0, Math.PI] } },
    // Her eight single 5-inch/38: four open Mk 30s on her main deck amidships,
    // two a side; a pair abreast her bridge; and one on her centreline over
    // No.2 and one over No.3.
    sec: { boxes: [
      { x: [-2.2, 2.2], y: [9.2, 14.2], z: [21.0, 31.5], hullToo: true },
      { x: [4.6, 9.4], y: [7.5, 11.6], z: [13.0, 21.0], hullToo: true },
      { x: [-9.4, -4.6], y: [7.5, 11.6], z: [13.0, 21.0], hullToo: true },
      five(7.2, -10.4), five(-7.2, -10.4), five(7.2, -23.1), five(-7.2, -23.1),
      { x: [-2.2, 2.2], y: [8.3, 12.5], z: [-46.0, -36.0], hullToo: true },
    ], gun: { whole: true, tris: 1400, error: 0.01 } },
    // Her quadruple 40 mm Bofors on her main deck abreast No.2.
    aa4: { boxes: [
      { x: [3.0, 8.2], y: [5.6, 9.6], z: [27.0, 35.8], hullToo: true },
      { x: [-8.2, -3.0], y: [5.6, 9.6], z: [27.0, 35.8], hullToo: true },
    ], gun: { whole: true, tris: 1200, error: 0.01 } },
  },
});
