// KMS Admiral Hipper off the owner's model of her -- "Admiral Hipper" by
// pepijn.dv (https://skfb.ly/oo7OI), under Creative Commons Attribution 4.0,
// credited on the game's Credits screen -- through build/kriss-hull.mjs: her
// flush-decked hull with its Atlantic bow, her tower bridge, her capped
// funnel, her mainmast, her catapult and hangar and her boats as one mesh,
// and every mounting of hers that trains cut free of her, each as the model
// drew it: her four twin 20.3 cm turrets, Anton and Bruno forward and Caesar
// and Dora aft; her six twin 10.5 cm, three a side; her four twin 3.7 cm; her
// eight quadruple and eight single 2 cm; her four triple banks of tubes on
// her upper deck; and her three screws.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-hipper-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { KM_PAINTS, kmPaint, BOOT } from './kriss-paints.mjs';

/** Her paint: the Kriegsmarine's greys, and her weather deck planked. */
const PAINTS = { ...KM_PAINTS, wood: 0x9c8a6a };
const paint = (f) => (f.up && !f.kind && f.cy > 2 && f.cy < 10 && f.ny > 0.97 ? 'wood' : kmPaint(f));

const TURRETS = [55, 56];
/** A mounting standing in the box the model draws round it, a hand clear all round. */
const around = (nodes, pad = 0.25) => (x0, x1, y0, y1, z0, z1) => ({ x: [x0 - pad, x1 + pad], y: [y0 - 0.15, y1 + 0.25], z: [z0 - pad, z1 + pad], nodes, hullToo: true });
const sec = around([41, 42, 43]), flak37 = around([49, 50]), vierling = around([51, 52]), flak20 = around([57, 58], 0.2);

await prepare({
  name: 'Hipper', script: 'build/prepare-hipper-hull.mjs',
  src: 'assets/models/admiral_hipper-maximum-compressed.glb',
  out: 'client/js/render/hipperHull.data.js',
  credit: '"Admiral Hipper" by pepijn.dv (https://skfb.ly/oo7OI), CC BY 4.0',
  // 205.9 m over all with her Atlantic bow, 7.2 m draught.
  loa: 205.9, draught: 7.2, bow: '+z', groupDepth: 2,
  paints: PAINTS, paint, paintLines: [0, BOOT],
  deckFallback: 7, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0, rigging: { y: 13 },
  kinds: {
    // Her four twin 20.3 cm SK C/34: Anton on her forecastle and Bruno
    // superfiring over it, trained ahead; Caesar superfiring over Dora on
    // her quarterdeck, both trained astern. Each low turret's box stops under
    // the barrels of the one that fires over it.
    main: { boxes: [
      { x: [-3.6, 3.6], y: [6.2, 9.1], z: [55.0, 72.5], nodes: TURRETS },
      { x: [-4.2, 4.2], y: [8.9, 12.6], z: [44.6, 61.5], nodes: TURRETS },
      { x: [-4.2, 4.2], y: [8.9, 12.6], z: [-59.8, -42.8], nodes: TURRETS },
      { x: [-3.6, 3.6], y: [6.2, 9.1], z: [-70.7, -53.3], nodes: TURRETS },
    ], gun: { guns: 2, minLen: 2, tris: 3000, barrelTris: 400, rests: [0, 0, Math.PI, Math.PI],
      // Caesar's foot is the deck under Dora's barrels as well as her own:
      // her pivot is the middle of her barbette, Bruno's mirrored.
      pivots: [null, null, [0, -47.94], null] } },
    // Her six twin 10.5 cm SK C/33 in their stabilised mountings, three a
    // side: abreast her bridge, abreast her catapult and abreast her after
    // tower.
    sec: { boxes: [
      sec(6.48, 10.23, 8.22, 10.42, 28.81, 36.23), sec(-10.23, -6.48, 8.00, 10.42, 28.81, 36.23),
      sec(6.34, 10.09, 5.42, 7.84, -15.15, -7.73), sec(-10.09, -6.34, 5.42, 7.84, -15.17, -7.75),
      sec(5.40, 9.15, 8.01, 10.42, -33.28, -25.86), sec(-9.15, -5.40, 8.03, 10.44, -33.28, -25.86),
    ], gun: { whole: true, tris: 1600, error: 0.01 } },
    // Her four twin 3.7 cm SK C/30, on the platforms of her after tower.
    aa37: { boxes: [
      flak37(-5.89, -3.23, 10.83, 13.65, -27.02, -25.05), flak37(3.23, 5.89, 10.83, 13.65, -27.08, -25.12),
      flak37(-4.27, -1.90, 10.46, 13.28, -39.91, -37.53), flak37(1.90, 4.27, 10.46, 13.29, -39.91, -37.53),
    ], gun: { whole: true, tris: 900, error: 0.01 } },
    // Her eight 2 cm Flakvierlinge: two on her bridge tower, two on the
    // platforms abreast her funnel, two on her after tower and two abreast
    // Caesar.
    aa4: { boxes: [
      vierling(-4.51, -1.38, 26.01, 27.90, 21.08, 22.39), vierling(1.39, 4.51, 26.01, 27.90, 21.08, 22.39),
      vierling(1.52, 4.65, 17.27, 19.15, 4.82, 6.13), vierling(-4.65, -1.52, 17.27, 19.16, 4.82, 6.13),
      vierling(1.90, 3.98, 12.98, 14.87, -31.46, -28.83), vierling(-3.97, -1.35, 12.98, 14.87, -31.46, -29.38),
      vierling(4.33, 6.40, 8.37, 10.26, -43.26, -40.64), vierling(-6.40, -3.78, 8.37, 10.26, -43.26, -41.18),
    ], gun: { whole: true, tris: 900, error: 0.01 } },
    // And her eight single 2 cm about her forecastle, her bridge and her
    // catapult.
    aa1: { boxes: [
      flak20(-6.32, -5.24, 7.96, 9.96, 39.85, 41.67), flak20(5.24, 6.32, 7.96, 9.96, 39.85, 41.67),
      flak20(-2.93, -1.89, 11.99, 12.94, 21.35, 21.91), flak20(1.89, 2.93, 11.99, 12.94, 21.35, 21.91),
      flak20(2.81, 4.38, 5.72, 7.44, 1.11, 2.05), flak20(-4.37, -2.82, 5.72, 7.44, 1.11, 2.05),
      flak20(1.20, 3.02, 8.02, 10.02, -17.27, -16.18), flak20(-2.99, -1.20, 8.02, 10.02, -17.27, -16.18),
    ], gun: { whole: true, tris: 500, error: 0.01 } },
    // Her four triple banks of 53.3 cm tubes on her upper deck, two a side,
    // abreast her bridge and abreast her after tower.
    tubes: { boxes: [
      { x: [-10.6, -7.0], y: [5.5, 7.8], z: [17.2, 25.9], nodes: [60, 61, 62, 63] },
      { x: [7.0, 10.6], y: [5.5, 7.8], z: [17.2, 25.9], nodes: [60, 61, 62, 63] },
      { x: [-10.5, -6.9], y: [5.5, 7.8], z: [-24.6, -16.0], nodes: [60, 61, 62, 63] },
      { x: [6.9, 10.5], y: [5.5, 7.8], z: [-24.6, -16.0], nodes: [60, 61, 62, 63] },
    ], gun: { tubes: 3, tris: 1500, rest: 'axis' } },
    // Her three screws.
    screw: { boxes: [
      { x: [-2.3, 2.3], y: [-7.4, -3.2], z: [-82.1, -78.6], nodes: [36] },
      { x: [3.4, 7.9], y: [-6.2, -2.0], z: [-79.0, -75.5], nodes: [36] },
      { x: [-7.9, -3.4], y: [-6.2, -2.0], z: [-79.0, -75.5], nodes: [36] },
    ], min: 20, hullToo: true },
  },
});
