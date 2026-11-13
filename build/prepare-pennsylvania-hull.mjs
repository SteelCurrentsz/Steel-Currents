// USS Pennsylvania off the owner's model of her -- "USS Pennsylvania" by
// kriss50 (https://skfb.ly/ptOoD), under Creative Commons Attribution 4.0,
// credited on the game's Credits screen -- through build/kriss-hull.mjs: her
// hull, her tripods and her funnel as one painted mesh, and her four triple
// 14-inch turrets (No.3 with her catapult on its roof), 5-inch/51 casemates,
// 5-inch/25s, Bofors, Oerlikons, .50-calibres and four screws cut free of her.
//
//   node build/prepare-pennsylvania-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { USN_PAINTS, usnPaint, BOOT } from './kriss-paints.mjs';

await prepare({
  name: 'Pennsylvania', script: 'build/prepare-pennsylvania-hull.mjs',
  src: 'assets/models/uss_pennsylvania-maximum-compressed.glb',
  out: 'client/js/render/pennsylvaniaHull.data.js',
  credit: '"USS Pennsylvania" by kriss50 (https://skfb.ly/ptOoD), CC BY 4.0',
  loa: 185.4, draught: 8.8, bow: '+z',
  paints: USN_PAINTS, paint: usnPaint, paintLines: [0, BOOT],
  deckFallback: 8, hullTris: 70000,
  kinds: {
    // Her ten 5-inch/51 in casemates, five a side along her upper deck.
    sec: { auto: { regions: [{}], nodes: [86, 88, 90, 92], size: [2, 8], minFaces: 1500, gap: 0.02 }, gun: { whole: true, tris: 900, error: 0.02 } },
    // Her eight 5-inch/25 high-angle guns, four a side about her funnel.
    aa5: { auto: { regions: [{}], nodes: [56, 58], size: [2, 6], minFaces: 1000, gap: 0.02 }, gun: { whole: true, tris: 700, error: 0.03 } },
    // Her Bofors, abreast her bridge and aft by her mainmast.
    aa4: { auto: { regions: [{}], nodes: [72, 74], size: [2, 6], minFaces: 1500, gap: 0.02 }, gun: { whole: true, tris: 800, error: 0.03 } },
    // Her twin Oerlikons, on her bridge and abaft her mainmast.
    aa2: { auto: { regions: [{}], nodes: [62], size: [1, 3.5], minFaces: 1000, gap: 0.01 }, gun: { whole: true, tris: 400, error: 0.03 } },
    // Her Oerlikons in her foretop and her maintop and about her bridge.
    aa1: { auto: { regions: [{}], nodes: [76], size: [1, 3.5], minFaces: 400, gap: 0.01 }, gun: { whole: true, tris: 240, error: 0.04 } },
    // And .50-calibre Brownings on her tops.
    mg: { auto: { regions: [{}], nodes: [66], size: [0.6, 3], minFaces: 400, gap: 0.01 }, gun: { whole: true, tris: 200, error: 0.04 } },
    // Her four screws, the inner pair aft of the outer.
    screw: { boxes: [
      { x: [0.6, 5.0], y: [-8.4, -4.0], z: [-80, -77] },
      { x: [-5.0, -0.6], y: [-8.4, -4.0], z: [-80, -77] },
      { x: [5.4, 10.0], y: [-8.0, -3.6], z: [-71.4, -68.4] },
      { x: [-10.0, -5.4], y: [-8.0, -3.6], z: [-71.4, -68.4] },
    ], min: 20, hullToo: true, nodes: [204] },
    // And her four triple 14-inch/45 turrets, two forward and two aft, the
    // inner of each pair superfiring, with a catapult on No.3's roof.
    main: { boxes: [
      { x: [-5.6, 5.6], y: [8.3, 12.0], z: [40.3, 63.2], hullToo: true, slack: 0.05 },
      { x: [-5.6, 5.6], y: [12.15, 16.0], z: [26.2, 49.1], hullToo: true, slack: 0.05 },
      { x: [-6.0, 6.0], y: [10.0, 15.5], z: [-54.0, -24.5], hullToo: true, slack: 0.05 },
      { x: [-5.6, 5.6], y: [6.5, 9.95], z: [-67.6, -44.7], hullToo: true, slack: 0.05 },
    ], gun: { guns: 3, minLen: 4, tris: 3000, barrelTris: 800, rests: [0, 0, Math.PI, Math.PI],
      pivots: [[0, 46.99], [0, 32.93], [0, -37.4], [0, -51.39]],
      // Her barrels, the long runs abreast in her gunhouse's face; and No.3's
      // face found by hand, her catapult over her making her look longer.
      test: (p) => p.pz1 - p.pz0 > 4 && p.px1 - p.px0 < 1.2 && p.py1 - p.py0 < 1.2 && Math.abs(p.px0 + p.px1) / 2 < 1.8,
      faces: [null, null, 5.22, null] } },
  },
});
