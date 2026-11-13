// USS Lexington off the owner's model of her -- "USS Lexington" by kriss50
// (https://skfb.ly/ptOWO), under Creative Commons Attribution 4.0, credited
// on the game's Credits screen -- through build/kriss-hull.mjs: her hull, her
// island and her great funnel as one mesh painted in Measure 1; her flight
// deck taken up and its outline kept, for carrier.js to lay her runway over
// with her lifts cut through it; and her guns cut free of her, each as the
// model drew it.
//
//   node build/prepare-lexington-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { USN_PAINTS, usnPaint, BOOT } from './kriss-paints.mjs';

await prepare({
  name: 'Lexington', script: 'build/prepare-lexington-hull.mjs',
  src: 'assets/models/uss_lexington-maximum-compressed.glb',
  out: 'client/js/render/lexingtonHull.data.js',
  credit: '"USS Lexington" by kriss50 (https://skfb.ly/ptOWO), CC BY 4.0',
  // 270.66 m over all, 9.3 m draught.
  loa: 270.66, draught: 9.3, bow: '+z',
  paints: USN_PAINTS, paint: usnPaint, paintLines: [0, BOOT],
  deckFallback: 10,
  hullTris: 80000,
  rigging: { y: 20 },
  carrier: { minY: 10, island: { x0: -27, x1: -11.0, z0: -40, z1: 60, face: -11.8 } },
  kinds: {
    // Her 5"/25 singles in their sponsons at the corners of her flight deck.
    dp: { auto: { regions: [{ x: [14, 28] }, { x: [-28, -14] }], size: [2, 7], minFaces: 6000, maxFaces: 7000 },
      gun: { guns: 1, minLen: 1.5, tris: 1400, barrelTris: 200, rest: undefined,
        test: (p) => p.pz1 - p.pz0 > 2.5 && p.px1 - p.px0 < 0.5 && p.py1 - p.py0 < 0.5, face: 0.5 } },
    // Her quadruple 1.1-inch, in the sponsons between them and in the tubs
    // fore and aft of her island where her 8-inch turrets were.
    aa4: { auto: { regions: [{ x: [14, 28] }, { x: [-28, -14] }], size: [2, 6], minFaces: 2800, maxFaces: 3100 },
      gun: { whole: true, tris: 700, error: 0.05 } },
    // And her Oerlikons, along her galleries.
    aa1: { auto: { regions: [{ x: [14, 28] }, { x: [-28, -14] }], size: [1.2, 2.6], minFaces: 580, maxFaces: 800 }, gun: { whole: true, tris: 200, error: 0.05 } },
  },
});
