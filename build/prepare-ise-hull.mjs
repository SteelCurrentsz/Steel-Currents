// IJN Ise off the owner's model of her sister -- "Japanese Battleship Hyuga"
// by kriss50 (https://skfb.ly/ptuAM), under Creative Commons Attribution 4.0,
// credited on the game's Credits screen; the two were alike in 1941 --
// through build/kriss-hull.mjs: her hull, her pagoda, her funnel and her
// mainmast as one painted mesh, and her six twin 35.6 cm turrets, sixteen
// 14 cm, four twin 12.7 cm, ten twin 25 mm and four screws cut free of her.
//
//   node build/prepare-ise-hull.mjs
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
    // Her sixteen 14 cm/50, eight a side, in the battery under her upper deck
    // from abaft her funnel to No.2's barbette: each a round shield on its
    // pedestal and its barrel, the model's own, and every one of them drawn
    // trained along her side -- the after two of a side aft, the rest forward.
    // They are all the one piece of the model (its node 131), so each is cut
    // by a box round it, port side aft to forward and then starboard; each
    // trains about the middle of its shield.
    sec: { boxes: [
      { x: [9.8, 12.5], y: [5.4, 7.1], z: [-1.5, 6.1] },
      { x: [11.3, 13.9], y: [5.4, 7.1], z: [3.8, 11.3] },
      { x: [11.2, 14.9], y: [5.4, 7.1], z: [17.9, 25.1] },
      { x: [11, 13.9], y: [5.4, 7.1], z: [25.2, 32.6] },
      { x: [10.6, 13.5], y: [5.4, 7.1], z: [32.9, 40.3] },
      { x: [10, 12.9], y: [5.4, 7.1], z: [39.9, 47.3] },
      { x: [9, 11.7], y: [5.4, 7.1], z: [47.75, 55.3] },
      { x: [7.3, 9.95], y: [5.4, 7.1], z: [53.5, 61.1] },
      { x: [-12.5, -9.8], y: [5.4, 7.1], z: [-1.5, 6.1] },
      { x: [-13.9, -11.3], y: [5.4, 7.1], z: [3.8, 11.3] },
      { x: [-14.9, -11.2], y: [5.4, 7.1], z: [17.9, 25.1] },
      { x: [-13.9, -11], y: [5.4, 7.1], z: [25.2, 32.6] },
      { x: [-13.5, -10.6], y: [5.4, 7.1], z: [32.9, 40.3] },
      { x: [-12.9, -10], y: [5.4, 7.1], z: [39.9, 47.3] },
      { x: [-11.7, -9], y: [5.4, 7.1], z: [47.75, 55.3] },
      { x: [-9.95, -7.3], y: [5.4, 7.1], z: [53.5, 61.1] },
    ], nodes: [131], min: 100, gun: { whole: true, tris: 360, error: 0.02,
      pivots: [[11.18, 4.8], [12.6, 10.02], [12.54, 19.2], [12.37, 26.48], [11.99, 34.21], [11.38, 41.16], [10.37, 49.02], [8.72, 54.8], [-11.18, 4.8], [-12.6, 10.02], [-12.54, 19.2], [-12.37, 26.48], [-11.99, 34.21], [-11.38, 41.16], [-10.37, 49.02], [-8.72, 54.8]],
      rests: [3.062, 3.055, 0.263, 0.159, 0.157, 0.157, 0.037, 0, -3.062, -3.055, -0.263, -0.159, -0.157, -0.157, -0.037, -0] } },
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
