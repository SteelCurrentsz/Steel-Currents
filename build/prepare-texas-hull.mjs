import { prepare } from './kriss-hull.mjs';
import { USN_PAINTS, usnPaint, BOOT } from './kriss-paints.mjs';

await prepare({
  name: 'Texas', script: 'build/prepare-texas-hull.mjs',
  src: 'assets/models/uss_texas-maximum-compressed.glb',
  out: 'client/js/render/texasHull.data.js',
  credit: '"USS Texas" by kriss50 (https://skfb.ly/ptOpy), CC BY 4.0',
  loa: 174.65, draught: 8.7, bow: '+z',
  paints: USN_PAINTS, paint: usnPaint, paintLines: [0, BOOT],
  deckFallback: 8, hullTris: 70000,
  drop: ['Object_26'],
  kinds: {
    sec: { auto: { regions: [{}], nodes: [42, 44], size: [2, 8], minFaces: 1500 }, gun: { whole: true, tris: 900, error: 0.02 } },
    aa3: { auto: { regions: [{}], nodes: [56, 58, 60, 62], size: [2, 6], minFaces: 1500 }, gun: { whole: true, tris: 700, error: 0.03 } },
    aa4: { auto: { regions: [{}], nodes: [64, 66, 68, 70], size: [2, 6], minFaces: 1500 }, gun: { whole: true, tris: 800, error: 0.03 } },
    aa1: { auto: { regions: [{ y: [0, 12.4] }, { y: [16.5, 40] }], nodes: [48, 50, 52, 54], size: [1, 3.5], minFaces: 400, gap: 0.01 }, gun: { whole: true, tris: 220, error: 0.04 } },
    screw: { boxes: [
      { x: [0.3, 5.2], y: [-7.2, -1.2], z: [-80, -77.2] },
      { x: [-5.2, -0.3], y: [-7.2, -1.2], z: [-80, -77.2] },
    ], min: 20, hullToo: true },
    main: { boxes: [
      { x: [-5.4, 5.4], y: [8.6, 12.15], z: [43.2, 66], hullToo: true },
      { x: [-5.4, 5.4], y: [11.5, 16.6], z: [30.6, 53.5] },
      { x: [-7, 7], y: [7.4, 12.8], z: [-35.2, -6.9] },
      { x: [-5.4, 5.4], y: [9.95, 15.6], z: [-61.5, -39] },
      { x: [-5.4, 5.4], y: [6.5, 9.95], z: [-73.5, -51.5] },
    ], gun: { guns: 2, minLen: 4, tris: 3000, barrelTris: 800, rests: [0, 0, Math.PI, Math.PI, Math.PI],
      pivots: [[0, 49.42], [0, 36.89], [0, -19.17], [0, -44.95], [0, -57.69]],
      // Her barrels, the long runs either side of her centreline; and No.3's
      // face found by hand, her catapult over her making her look wider.
      test: (p) => p.pz1 - p.pz0 > 4 && p.px1 - p.px0 < 1.4 && p.py1 - p.py0 < 1.4 && Math.abs(p.px0 + p.px1) / 2 > 0.4 && Math.abs(p.px0 + p.px1) / 2 < 2,
      faces: [null, null, 4.0, null, null] } },
  },
});
