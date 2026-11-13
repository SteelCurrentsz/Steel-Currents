import { prepare } from './kriss-hull.mjs';
import { IJN_BB_PAINTS, ijnBBPaint, BOOT } from './kriss-paints.mjs';

await prepare({
  name: 'Ise', script: 'build/prepare-ise-hull.mjs',
  src: 'assets/models/japanese_battleship_hyuga-maximum-compressed.glb',
  out: 'client/js/render/iseHull.data.js',
  credit: '"Japanese Battleship Hyūga" by kriss50 (https://skfb.ly/ptuAM), CC BY 4.0',
  loa: 215.8, draught: 9.2, bow: '+z',
  paints: IJN_BB_PAINTS, paint: ijnBBPaint, paintLines: [0, BOOT], deckPaints: ['wood'],
  deckFallback: 8, hullTris: 70000,
  kinds: {
    // Her four twin 12.7 cm high-angle guns, two a side abreast her bridge.
    ha: { auto: { regions: [{}], nodes: [123, 125, 127, 129], size: [2, 7], minFaces: 2000, gap: 0.02 }, gun: { whole: true, tris: 900, error: 0.02 } },
    // Her ten twin 25 mm, about her bridge and her funnel and on her mainmast.
    aa2: { auto: { regions: [{}], nodes: [151, 153, 155, 157, 159, 161, 163, 165, 167, 169], size: [1, 3.5], minFaces: 2000, gap: 0.02 }, gun: { whole: true, tris: 500, error: 0.03 } },
    // Her four screws, the inner pair aft of the outer.
    screw: { boxes: [
      { x: [0.6, 5.2], y: [-8.8, -4.6], z: [-86.2, -83.1] },
      { x: [-5.2, -0.6], y: [-8.8, -4.6], z: [-86.2, -83.1] },
      { x: [4.9, 9.4], y: [-8.0, -3.9], z: [-77.1, -74.1] },
      { x: [-9.4, -4.9], y: [-8.0, -3.9], z: [-77.1, -74.1] },
    ], min: 20, hullToo: true, nodes: [115] },
    // And her six twin 35.6 cm turrets: two forward, No.2 superfiring; two
    // amidships between her funnel and her mainmast, both facing aft, No.3
    // superfiring over No.4; and two aft, No.5 superfiring. The lower of each
    // pair is cut first, so the barrels of the one over it go with their own.
    main: { boxes: [
      { x: [-5, 5], y: [8.4, 11.9], z: [53.3, 75.2], hullToo: true, slack: 0.05 },
      { x: [-5, 5], y: [11.5, 15.2], z: [40.5, 62.0], hullToo: true, slack: 0.05 },
      { x: [-5, 5], y: [6.35, 9.85], z: [-37.3, -15.4], hullToo: true, slack: 0.05 },
      { x: [-5, 5], y: [9.45, 12.8], z: [-25.0, -2.9], hullToo: true, slack: 0.05 },
      { x: [-5, 5], y: [6.35, 9.85], z: [-80.5, -58.7], hullToo: true, slack: 0.05 },
      { x: [-5, 5], y: [8.95, 12.6], z: [-69.5, -46.2], hullToo: true, slack: 0.05 },
    ], gun: { guns: 2, minLen: 4, tris: 3000, barrelTris: 800, rests: [0, 0, Math.PI, Math.PI, Math.PI, Math.PI],
      pivots: [[0, 59.42], [0, 46.6], [0, -21.5], [0, -9.04], [0, -64.8], [0, -52.3]],
      test: (p) => p.pz1 - p.pz0 > 4 && p.px1 - p.px0 < 1.4 && p.py1 - p.py0 < 1.4 && Math.abs(p.px0 + p.px1) / 2 < 2,
      faces: [4.4, null, 4.4, null, null, null] } },
  },
});
