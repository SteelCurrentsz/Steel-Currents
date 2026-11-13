import { prepare } from './kriss-hull.mjs';
import { USN_PAINTS, usnPaint, BOOT } from './kriss-paints.mjs';

await prepare({
  name: 'New Mexico', script: 'build/prepare-newmexico-hull.mjs',
  src: 'assets/models/uss_new_mexico-maximum-compressed.glb',
  out: 'client/js/render/newmexicoHull.data.js',
  credit: '"USS New Mexico" by kriss50 (https://skfb.ly/ptOVP), CC BY 4.0',
  loa: 190.2, draught: 9.1, bow: '+z',
  paints: USN_PAINTS, paint: usnPaint, paintLines: [0, BOOT],
  deckFallback: 8, hullTris: 70000,
  kinds: {
    // Her twelve 5-inch/51, behind their shields on her upper deck and her
    // 01 level, six a side.
    sec: { auto: { regions: [{}], nodes: [40, 42, 44, 46], size: [2, 8], minFaces: 1500, gap: 0.02 }, gun: { whole: true, tris: 900, error: 0.02 } },
    // Her eight 5-inch/25 high-angle guns, four a side abreast her funnel.
    aa5: { auto: { regions: [{}], nodes: [36, 38], size: [2, 6], minFaces: 1000, gap: 0.02 }, gun: { whole: true, tris: 700, error: 0.03 } },
    // Her Oerlikons, about her bridge and her mainmast.
    aa1: { auto: { regions: [{}], nodes: [34], size: [1, 3.5], minFaces: 400, gap: 0.01 }, gun: { whole: true, tris: 240, error: 0.04 } },
    // And four .50-calibre Brownings in her foretop.
    mg: { auto: { regions: [{}], nodes: [56], size: [0.8, 3], minFaces: 200, gap: 0.01 }, gun: { whole: true, tris: 160, error: 0.04 } },
    // Her four screws, the inner pair aft of the outer.
    screw: { boxes: [
      { x: [1.2, 5.2], y: [-8.6, -4.2], z: [-84.9, -82.3] },
      { x: [-5.2, -1.2], y: [-8.6, -4.2], z: [-84.9, -82.3] },
      { x: [6.6, 9.8], y: [-8.6, -4.0], z: [-72.9, -70.3] },
      { x: [-9.8, -6.6], y: [-8.6, -4.0], z: [-72.9, -70.3] },
    ], min: 20, hullToo: true, nodes: [150] },
    // And her four triple 14-inch/50 turrets, two forward and two aft, the
    // inner of each pair superfiring.
    main: { boxes: [
      { x: [-5.8, 5.8], y: [8.4, 11.75], z: [37.6, 62.6], hullToo: true },
      { x: [-5.8, 5.8], y: [11.9, 15.6], z: [23.7, 48.7], hullToo: true },
      { x: [-5.8, 5.8], y: [9.5, 13.0], z: [-57.7, -32.8], hullToo: true },
      { x: [-5.8, 5.8], y: [6.0, 9.4], z: [-71.8, -46.8], hullToo: true },
    ], gun: { guns: 3, minLen: 4, tris: 3000, barrelTris: 800, rests: [0, 0, Math.PI, Math.PI],
      pivots: [[0, 44.51], [0, 30.58], [0, -39.64], [0, -53.69]],
      test: (p) => p.pz1 - p.pz0 > 4 && p.px1 - p.px0 < 1.2 && p.py1 - p.py0 < 1.2 } },
  },
});
