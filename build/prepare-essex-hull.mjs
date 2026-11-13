// USS Essex off the owner's model of her -- "USS Essex (CV-9)" by kriss50
// (https://skfb.ly/p9vxQ), under Creative Commons Attribution 4.0, credited on
// the game's Credits screen -- through build/kriss-hull.mjs: her hull, her
// island and her galleries as one mesh painted in Measure 21; her flight deck
// taken up and its outline kept, for carrier.js to lay her runway over with
// her lifts cut through it; and her four twin 5"/38s, her Bofors and her
// Oerlikons cut free of her, each as the model drew it.
//
//   node build/prepare-essex-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { USN_PAINTS, usnPaint, BOOT } from './kriss-paints.mjs';

await prepare({
  name: 'Essex', script: 'build/prepare-essex-hull.mjs',
  src: 'assets/models/uss_essex_cv-9-maximum-compressed.glb',
  out: 'client/js/render/essexHull.data.js',
  credit: '"USS Essex (CV-9)" by kriss50 (https://skfb.ly/p9vxQ), CC BY 4.0',
  // 266 m over all, 8.66 m draught.
  loa: 266.0, draught: 8.66, bow: '+z',
  paints: USN_PAINTS, paint: usnPaint, paintLines: [0, BOOT],
  deckFallback: 10,
  hullTris: 90000,
  rigging: { y: 22 },
  // Her island to starboard, with the twin 5"/38s fore and aft of it.
  carrier: { minY: 12, island: { x0: -26, x1: -11.0, z0: -40, z1: 53, face: -11.8 } },
  // Her deck-edge lift, to port abreast her island: carrier.js builds the one
  // that runs.
  remove: [{ x: [11.5, 24.5], y: [17.0, 19.6], z: [5.0, 25.0], hullToo: true }],
  kinds: {
    // Her four twin 5"/38s in their Mk 32 gunhouses, two before her island
    // and two abaft it, all on her flight deck to starboard.
    dp: { boxes: [
      { x: [-18.2, -11.4], y: [18.4, 25.5], z: [42.5, 51.5] },
      { x: [-18.2, -11.4], y: [18.4, 25.5], z: [34.5, 42.4] },
      { x: [-18.2, -11.4], y: [20.9, 26], z: [-31.2, -21.5], hullToo: true },
      { x: [-18.2, -11.4], y: [18.4, 23.6], z: [-39.2, -30.0], hullToo: true },
    ], gun: { guns: 2, minLen: 2, tris: 1600, barrelTris: 400, rests: [0, 0, Math.PI, Math.PI],
      test: (p) => p.pz1 - p.pz0 > 2.5 && p.px1 - p.px0 < 0.5 && p.py1 - p.py0 < 0.5, face: 0.8 } },
    // Her quadruple Bofors, in their sponsons at her deck edges and on her island.
    aa4: { auto: { regions: [{ x: [16, 26] }, { x: [-26, -16] }, { x: [-19, -10], y: [21, 34] }], size: [2.2, 6.5], height: [0.9, 4], minFaces: 1500, gap: 0.03 },
      gun: { whole: true, tris: 700, error: 0.05 } },
    // And her Oerlikons, in rows along her galleries.
    aa1: { auto: { regions: [{ x: [17, 26], y: [12, 20] }, { x: [-26, -17], y: [12, 20] }], size: [0.8, 3.2], height: [0.5, 3], minFaces: 600, maxFaces: 1400 },
      gun: { whole: true, tris: 200, error: 0.05 } },
  },
});
