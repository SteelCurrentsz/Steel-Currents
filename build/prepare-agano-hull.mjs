// IJN Agano off the owner's model of her class -- "Japanese Light Cruiser
// 5-阿贺野（Agano）" by 全斗焕 (https://skfb.ly/owptN), under Creative Commons
// Attribution 4.0, credited on the game's Credits screen -- through
// build/kriss-hull.mjs: her hull, her bridge, her raked funnel, her masts, her
// catapult and its floatplane and her boats as one mesh in the fleet's grey,
// and every mounting of hers that trains cut free of her, each as the model
// drew it: her three twin 15.2 cm turrets, two forward and one aft; her two
// twin 7.6 cm/60 high-angle mountings abreast her bridge; her two quadruple
// banks of 61 cm tubes on her centreline amidships; her ten triple and
// eighteen single 25 mm; and her four screws.
//
// The model names its pieces for what they are -- it is her sister Yahagi as
// she was fitted in 1944 -- so each kind is cut from its own.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-agano-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { IJN_PAINTS, ijnPaint, BOOT } from './kriss-paints.mjs';

/** The model's pieces each kind is drawn in. */
const TURRETS = [45, 90];
const HA = [89];
const TUBES = [87, 88];
const LIGHT = [91, 92];
/** A 25 mm mounting where the model stands it, a hand clear all round. */
const box = (x0, x1, y0, y1, z0, z1) => ({ x: [x0 - 0.2, x1 + 0.2], y: [y0 - 0.1, y1 + 0.2], z: [z0 - 0.2, z1 + 0.2], nodes: LIGHT, hullToo: true });

await prepare({
  name: 'Agano', script: 'build/prepare-agano-hull.mjs',
  src: 'assets/models/japanese_light_cruiser_5-agano-maximum-compressed.glb',
  out: 'client/js/render/aganoHull.data.js',
  credit: '"Japanese Light Cruiser 5-阿贺野（Agano）" by 全斗焕 (https://skfb.ly/owptN), CC BY 4.0',
  // 174.1 m over all, 5.63 m draught.
  loa: 174.1, draught: 5.63, bow: '+z', groupDepth: 2,
  // Her decks are planked where they lie flat and low -- her forecastle, her
  // upper deck and her shelter deck -- and grey where they slope or stand
  // high.
  paints: IJN_PAINTS, paintLines: [0, BOOT],
  paint: (f) => (f.up && !f.kind && f.cy > 2 && f.cy < 11 && f.ny > 0.97 ? 'deck' : ijnPaint({ ...f, up: false })),
  deckFallback: 6, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0,
  kinds: {
    // Her three twin 15.2 cm/50 41st Year Type: No.1 on her forecastle and
    // No.2 superfiring over it, trained ahead, and No.3 on her quarterdeck,
    // trained astern. Taken in that order, each takes what stands in its own
    // box and none of the next's.
    main: { boxes: [
      { x: [-2.9, 2.9], y: [5.4, 8.6], z: [49.4, 61.5], nodes: TURRETS },
      { x: [-3.6, 3.6], y: [7.6, 12.0], z: [41.0, 56.0], nodes: TURRETS },
      { x: [-2.9, 2.9], y: [5.0, 8.3], z: [-60.5, -49.0], nodes: TURRETS },
    ], gun: { guns: 2, minLen: 1.5, tris: 2400, barrelTris: 300, rests: [0, 0, Math.PI] } },
    // Her two twin 7.6 cm/60 Type 98 high-angle mountings, one a side on her
    // upper deck abreast her bridge, trained ahead.
    sec: { boxes: [
      { x: [3.4, 8.0], y: [4.5, 7.6], z: [15.8, 22.4], nodes: HA, hullToo: true },
      { x: [-8.0, -3.4], y: [4.5, 7.6], z: [15.8, 22.4], nodes: HA, hullToo: true },
    ], gun: { guns: 2, minLen: 1.0, tris: 2400, barrelTris: 300, rests: [0, 0] } },
    // Her two quadruple banks of 61 cm Type 92 tubes, on her centreline
    // abaft her funnel.
    tubes: { boxes: [
      { x: [-2.6, 2.6], y: [5.6, 8.5], z: [-12.0, -1.4], nodes: TUBES },
      { x: [-2.6, 2.6], y: [5.6, 8.5], z: [-30.5, -19.0], nodes: TUBES },
    ], gun: { tubes: 4, tris: 1500, rest: 'axis' } },
    // Her ten triple 25 mm Type 96: two on her bridge, four abreast her
    // funnel and catapult, two abaft her mainmast and two right aft.
    aa3: { boxes: [
      box(-4.24, -2.04, 9.17, 11.01, 28.03, 30.30), box(1.91, 4.18, 9.17, 11.01, 28.03, 30.23),
      box(-7.66, -5.39, 8.40, 10.24, -3.48, -1.38), box(5.07, 7.35, 8.40, 10.24, -3.54, -1.45),
      box(-7.69, -5.42, 8.40, 10.24, -18.17, -16.08), box(5.42, 7.69, 8.40, 10.24, -18.25, -16.16),
      box(-4.23, -1.95, 7.04, 8.88, -43.08, -40.97), box(1.95, 4.23, 7.04, 8.88, -43.14, -41.05),
      box(-2.85, -0.76, 4.57, 6.42, -70.20, -67.92), box(0.94, 3.04, 4.57, 6.42, -70.20, -67.92),
    ], gun: { whole: true, tris: 1600, error: 0.01 } },
    // And her eighteen singles, about her forecastle, her bridge and her
    // quarterdeck.
    aa1: { boxes: [
      box(-5.42, -4.54, 4.96, 7.03, 42.83, 45.09), box(4.62, 5.50, 4.97, 7.04, 42.63, 44.89),
      box(-6.95, -4.99, 4.81, 6.88, 36.10, 37.81), box(-2.03, -0.07, 9.53, 11.61, 36.03, 37.75),
      box(0.31, 2.03, 9.53, 11.61, 35.79, 37.75), box(4.75, 6.46, 4.84, 6.91, 35.69, 37.65),
      box(-2.88, -0.93, 7.07, 9.14, 32.58, 34.29), box(1.17, 2.88, 7.07, 9.14, 32.33, 34.29),
      box(-7.00, -4.74, 8.42, 10.49, 3.26, 4.14), box(4.74, 7.00, 8.42, 10.49, 2.98, 3.85),
      box(-6.84, -5.13, 4.58, 6.66, -48.36, -46.41), box(4.89, 6.81, 4.58, 6.66, -48.37, -46.65),
      box(-4.49, -3.62, 4.67, 6.74, -60.40, -58.14), box(3.32, 4.20, 4.67, 6.74, -60.40, -58.14),
      box(3.37, 4.25, 4.64, 6.71, -64.10, -61.84), box(-4.53, -3.65, 4.64, 6.71, -64.10, -61.84),
      box(-4.68, -2.97, 4.33, 6.40, -76.25, -74.30), box(3.15, 5.08, 4.29, 6.36, -77.04, -75.32),
    ], gun: { whole: true, tris: 700, error: 0.01 } },
    // Her four screws, the wing pair forward of the inner.
    screw: { boxes: [
      { x: [4.9, 6.2], y: [-4.9, -1.7], z: [-64.4, -61.9], nodes: [113, 118] },
      { x: [-6.2, -4.9], y: [-4.9, -1.7], z: [-64.4, -61.9], nodes: [113, 118] },
      { x: [1.9, 3.2], y: [-4.9, -1.7], z: [-74.2, -71.8], nodes: [113, 118] },
      { x: [-3.2, -1.9], y: [-4.9, -1.7], z: [-74.2, -71.8], nodes: [113, 118] },
    ], min: 20, hullToo: true },
  },
});
