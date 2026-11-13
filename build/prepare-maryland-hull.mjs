import { prepare } from './kriss-hull.mjs';
import { USN_PAINTS, usnPaint, BOOT } from './kriss-paints.mjs';

await prepare({
  name: 'Maryland', script: 'build/prepare-maryland-hull.mjs',
  src: 'assets/models/uss_maryland-maximum-compressed.glb',
  out: 'client/js/render/marylandHull.data.js',
  credit: '"USS Maryland" by kriss50 (https://skfb.ly/ptOoS), CC BY 4.0',
  loa: 190.2, draught: 9.3, bow: '+z',
  paints: USN_PAINTS, paint: usnPaint, paintLines: [0, BOOT],
  deckFallback: 8, hullTris: 70000,
  kinds: {
    // Her eight 5-inch/51, four a side on her upper deck.
    sec: { auto: { regions: [{}], nodes: [78, 80, 82], size: [2, 8], minFaces: 1500, gap: 0.02 }, gun: { whole: true, tris: 900, error: 0.02 } },
    // Her eight 5-inch/25 high-angle guns, four a side abreast her funnels.
    aa5: { auto: { regions: [{}], nodes: [52, 54], size: [2, 6], minFaces: 1000, gap: 0.02 }, gun: { whole: true, tris: 700, error: 0.03 } },
    // Her Bofors, in their tubs about her superstructure.
    aa4: { auto: { regions: [{}], nodes: [66, 68, 70, 72], size: [2, 6], minFaces: 1500, gap: 0.02 }, gun: { whole: true, tris: 800, error: 0.03 } },
    // And her Oerlikons along her decks, on her bridge and her mainmast; the
    // four on No.3's roof train with it.
    aa1: { auto: { regions: [{ z: [-32.9, 100] }, { z: [-100, -41] }, { z: [-41, -32.9], y: [0, 12.2] }, { z: [-41, -32.9], x: [6, 20] }, { z: [-41, -32.9], x: [-20, -6] }], nodes: [60, 62, 64], size: [1, 3.5], minFaces: 400, gap: 0.01 }, gun: { whole: true, tris: 220, error: 0.04 } },
    // Her four screws, the inner pair aft of the outer.
    screw: { boxes: [
      { x: [0.4, 5.4], y: [-9, -4.2], z: [-84.8, -81.6] },
      { x: [-5.4, -0.4], y: [-9, -4.2], z: [-84.8, -81.6] },
      { x: [5.0, 10.5], y: [-9, -3.8], z: [-74.5, -69.5] },
      { x: [-10.5, -5.0], y: [-9, -3.8], z: [-74.5, -69.5] },
    ], min: 20, hullToo: true, nodes: [202] },
    // And her four twin 16-inch/45 turrets, two forward and two aft, the
    // inner of each pair superfiring.
    main: { boxes: [
      { x: [-5.9, 5.9], y: [8.0, 11.7], z: [37.6, 62.6], hullToo: true, slack: 0.05, not: [{ x: [2.3, 4.8], z: [54.3, 58.3] }, { x: [-4.8, -2.3], z: [54.3, 58.3] }] },
      { x: [-5.9, 5.9], y: [11.75, 16.5], z: [23.3, 48.3], hullToo: true, slack: 0.05 },
      { x: [-5.9, 5.9], y: [9.3, 13.0], z: [-57.8, -32.9], hullToo: true, slack: 0.05 },
      { x: [-5.9, 5.9], y: [5.6, 9.2], z: [-72.0, -47.1], hullToo: true, slack: 0.05 },
    ], gun: { guns: 2, minLen: 4, tris: 3000, barrelTris: 800, rests: [0, 0, Math.PI, Math.PI],
      pivots: [[0, 44.35], [0, 30.04], [0, -39.68], [0, -53.85]],
      test: (p) => p.pz1 - p.pz0 > 4 && p.px1 - p.px0 < 1.4 && p.py1 - p.py0 < 1.4,
      // No.1 and No.4 have deck fittings by them that make them look longer.
      faces: [5.2, null, null, 5.2] } },
  },
});
