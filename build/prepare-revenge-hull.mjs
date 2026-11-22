// HMS Revenge off the owner's model of her -- "HMS Revenge 1915" by martyn169
// (https://skfb.ly/oTGEQ), under Creative Commons Attribution 4.0, credited on
// the game's Credits screen -- through build/kriss-hull.mjs: her hull, her
// bridge, her single funnel, her tripod and her boats as one mesh, and every
// mounting of hers that trains cut free of her, each as the model drew it:
// her four twin 15-inch turrets, A and B forward and X and Y aft; her 6-inch
// in their casemates along her sides and abreast her funnel; and her screws.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-revenge-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { RENOWN_PAINTS, warspitePaint, BOOT } from './kriss-paints.mjs';

/** A 6-inch casemate gun whose shield stands at (x, z0), its barrel reaching forward. */
const cas = (x, z0) => ({ x: x > 0 ? [x - 2.0, x + 1.4] : [x - 1.4, x + 2.0], y: [4.4, 7.3], z: [z0 - 0.3, z0 + 7.4], hullToo: true });

await prepare({
  name: 'Revenge', script: 'build/prepare-revenge-hull.mjs',
  src: 'assets/models/hms_revenge_1915-maximum-compressed.glb',
  out: 'client/js/render/revengeHull.data.js',
  credit: '"HMS Revenge 1915" by martyn169 (https://skfb.ly/oTGEQ), CC BY 4.0',
  // 190.3 m over all (624 ft 3 in), 8.7 m deep load draught.
  loa: 190.3, draught: 8.7, bow: '-x', groupDepth: 2,
  paints: RENOWN_PAINTS, paint: warspitePaint, paintLines: [0, BOOT],
  deckFallback: 7, hullTris: 90000,
  rigging: { y: 16 },
  kinds: {
    main: { boxes: [
      { x: [-6.5, 6.5], y: [6.0, 11.2], z: [40.0, 65.0] },
      { x: [-6.5, 6.5], y: [9.4, 14.8], z: [26.0, 51.0] },
      { x: [-6.5, 6.5], y: [5.8, 10.8], z: [-72.0, -49.0] },
      { x: [-6.5, 6.5], y: [8.6, 13.8], z: [-58.0, -32.5] },
    ], hullToo: true, gun: { guns: 2, minLen: 2, tris: 3600, barrelTris: 500, rests: [0, 0, Math.PI, Math.PI],
      // Each barrel is drawn with its slide and its breech, back into the gunhouse.
      face: 1.0, cuts: [0], test: (p) => p.px1 - p.px0 < 2.0 && p.pz1 > 5 && p.py1 - p.py0 < 1.9 } },
    // Her twelve 6-inch Mk XII in casemates, six a side along her main deck
    // from abreast B turret aft past her funnel, trained ahead.
    sec: { boxes: [
      cas(12, 13.5), cas(-12, 13.5), cas(12, 5.3), cas(-12, 5.3), cas(12, -3.0), cas(-12, -3.0),
      cas(12, -11.2), cas(-12, -11.2), cas(12, -23.7), cas(-12, -23.7), cas(9.4, -34.6), cas(-9.4, -34.6),
    ], gun: { whole: true, tris: 900, error: 0.01 }, min: 10 },
    // Her four screws.
    screw: { boxes: [
      { x: [0, 7], y: [-8.6, -4], z: [-80, -70] }, { x: [-7, 0], y: [-8.6, -4], z: [-80, -70] },
      { x: [0, 7], y: [-8.6, -4], z: [-70, -58] }, { x: [-7, 0], y: [-8.6, -4], z: [-70, -58] },
    ], min: 20, hullToo: true },
  },
});
