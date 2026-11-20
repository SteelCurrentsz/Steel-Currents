// FS Richelieu off the owner's model of her -- "Richelieu" by SB-129
// (https://skfb.ly/oEK7F), under Creative Commons Attribution 4.0, credited on
// the game's Credits screen -- through build/kriss-hull.mjs: her hull, her
// tower, her mack -- funnel and mainmast in one, raked aft -- her after
// superstructure and her boats as one mesh, and every mounting of hers that
// trains cut free of her, each as the model drew it, as she was refitted in
// New York in 1943: her two quadruple 380 mm turrets, both forward; her three
// triple 152 mm aft; her six twin 100 mm; her fourteen quadruple 40 mm Bofors;
// her forty 20 mm Oerlikons; and her four screws.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-richelieu-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { MN_PAINTS, mnPaint, BOOT } from './kriss-paints.mjs';

const TURRETS = [17, 21, 72, 76];
const SEC = [22, 68, 69, 78];
const DP = [54, 55, 56];
/** A mounting standing in the box the model draws round it, a hand clear all round. */
const around = (nodes, pad = 0.25) => (x0, x1, y0, y1, z0, z1) => ({ x: [x0 - pad, x1 + pad], y: [y0 - 0.15, y1 + 0.25], z: [z0 - pad, z1 + pad], nodes, hullToo: true });
const quad = around([63, 64, 65, 66, 67]), oer = around([59, 60, 61, 62], 0.15);

await prepare({
  name: 'Richelieu', script: 'build/prepare-richelieu-hull.mjs',
  src: 'assets/models/richelieu-maximum-compressed.glb',
  out: 'client/js/render/richelieuHull.data.js',
  credit: '"Richelieu" by SB-129 (https://skfb.ly/oEK7F), CC BY 4.0',
  // 247.85 m over all, 9.6 m draught.
  loa: 247.85, draught: 9.6, bow: '+z', groupDepth: 2,
  paints: MN_PAINTS, paint: mnPaint, paintLines: [0, BOOT],
  deckFallback: 8, hullTris: 90000, rigging: { y: 17 },
  kinds: {
    // Her two quadruple 380 mm/45 Mle 1935, both forward: I on her forecastle
    // and II superfiring over it, each a pair of twin guns in its own
    // half-turret behind a bulkhead.
    main: { boxes: [
      { x: [-7.8, 7.8], y: [7.2, 11.6], z: [42.6, 68.2], nodes: TURRETS },
      { x: [-7.8, 7.8], y: [10.8, 16.3], z: [10.4, 36.0], nodes: TURRETS },
    ], gun: { guns: 4, minLen: 2, tris: 4000, barrelTris: 800, rests: [0, 0] } },
    // Her three triple 152 mm/55 Mle 1930 aft: one on her centreline over
    // her after superstructure and one a side abaft it, all trained astern.
    sec: { boxes: [
      { x: [-4.6, 4.6], y: [11.3, 15.8], z: [-60.0, -46.5], nodes: SEC },
      { x: [3.9, 13.1], y: [8.9, 13.8], z: [-74.3, -60.9], nodes: SEC },
      { x: [-13.1, -3.9], y: [8.9, 13.8], z: [-74.3, -60.9], nodes: SEC },
    ], gun: { guns: 3, minLen: 1.5, tris: 2400, barrelTris: 400, rests: [Math.PI, Math.PI, Math.PI] } },
    // Her six twin 100 mm/45 Mle 1930 in their shields, three a side about
    // her mack.
    dp: { boxes: [
      { x: [-15.7, -11.7], y: [9.0, 11.8], z: [-21.9, -15.6], nodes: DP, hullToo: true },
      { x: [11.7, 15.7], y: [9.0, 11.8], z: [-21.9, -15.6], nodes: DP, hullToo: true },
      { x: [-13.4, -9.4], y: [9.0, 11.8], z: [-16.5, -10.3], nodes: DP, hullToo: true },
      { x: [9.4, 13.4], y: [9.0, 11.8], z: [-16.5, -10.3], nodes: DP, hullToo: true },
      { x: [-12.4, -8.4], y: [10.7, 13.5], z: [-32.9, -26.6], nodes: DP, hullToo: true },
      { x: [8.4, 12.4], y: [10.7, 13.5], z: [-32.9, -26.6], nodes: DP, hullToo: true },
    ], gun: { whole: true, tris: 1200, error: 0.01 } },
    // Her fourteen quadruple 40 mm Bofors, fitted in New York: abreast her
    // turrets, about her tower and her mack, and on her quarterdeck.
    aa4: { boxes: [
      quad(9.22, 13.52, 6.00, 9.03, 26.15, 30.45), quad(-13.51, -9.22, 6.00, 9.03, 26.15, 30.45),
      quad(12.04, 15.51, 8.39, 11.43, 3.57, 7.88), quad(-15.51, -12.03, 8.39, 11.43, 3.57, 7.88),
      quad(-8.77, -5.09, 13.64, 16.68, -3.11, 1.19), quad(5.09, 8.78, 13.64, 16.68, -3.11, 1.18),
      quad(4.42, 7.90, 13.55, 16.58, -37.56, -33.25), quad(-7.90, -4.42, 13.55, 16.58, -37.56, -33.25),
      quad(11.03, 14.51, 8.40, 11.43, -41.91, -37.60), quad(-14.50, -11.02, 8.40, 11.44, -41.91, -37.60),
      quad(4.05, 8.36, 5.93, 8.96, -97.78, -93.48), quad(-8.35, -4.05, 5.93, 8.96, -97.78, -93.48),
      quad(3.27, 7.42, 5.97, 9.00, -109.45, -105.20), quad(-7.42, -3.27, 5.97, 9.00, -109.45, -105.20),
    ], gun: { whole: true, tris: 1000, error: 0.01 } },
    // And her forty 20 mm Oerlikons.
    aa1: { boxes: [
      oer(-0.69, 0.70, 7.65, 9.17, 79.52, 81.81), oer(5.34, 6.73, 15.50, 17.01, 12.31, 14.60), oer(-6.72, -5.33, 15.50, 17.01, 12.31, 14.60),
      oer(2.64, 4.04, 15.50, 17.01, 12.03, 14.32), oer(-4.03, -2.63, 15.50, 17.01, 12.03, 14.32), oer(-4.95, -3.16, 26.29, 27.81, -0.98, 0.74),
      oer(3.24, 4.96, 25.82, 27.81, -1.05, 0.74), oer(-16.52, -14.22, 8.87, 10.39, -2.74, -1.35), oer(14.23, 16.51, 8.87, 10.40, -2.75, -1.35),
      oer(14.23, 16.52, 8.88, 10.39, -5.03, -3.64), oer(-16.51, -14.23, 8.88, 10.39, -5.03, -3.64), oer(14.23, 16.52, 8.88, 10.39, -7.27, -5.87),
      oer(-16.51, -14.23, 8.88, 10.39, -7.27, -5.87), oer(4.45, 6.74, 27.82, 29.34, -7.83, -6.43), oer(-6.73, -4.44, 27.82, 29.34, -7.83, -6.43),
      oer(2.43, 4.72, 26.20, 27.71, -29.50, -28.10), oer(-4.72, -2.43, 26.20, 27.71, -29.50, -28.10), oer(13.86, 16.15, 8.88, 10.40, -32.85, -31.45),
      oer(-16.15, -13.86, 8.88, 10.40, -32.85, -31.45), oer(-3.42, -1.70, 26.20, 27.71, -33.67, -31.88), oer(1.63, 3.43, 25.72, 27.71, -33.67, -31.95),
      oer(-2.90, -1.18, 17.98, 19.51, -42.05, -40.24), oer(1.10, 2.90, 17.98, 19.51, -42.05, -40.32), oer(12.44, 14.74, 8.40, 10.39, -48.52, -47.10),
      oer(-14.74, -12.44, 8.88, 10.39, -48.52, -47.10), oer(-14.54, -12.25, 8.87, 10.40, -50.80, -49.38), oer(12.25, 14.55, 8.88, 10.39, -50.80, -49.39),
      oer(-2.75, -1.36, 15.08, 16.60, -51.72, -49.43), oer(1.36, 2.76, 15.08, 16.60, -51.72, -49.43), oer(12.06, 14.35, 8.40, 10.40, -53.03, -51.61),
      oer(-14.36, -12.06, 8.40, 10.40, -53.03, -51.61), oer(-3.31, -1.58, 8.87, 10.40, -75.92, -74.12), oer(1.52, 3.31, 8.87, 10.40, -75.92, -74.19),
      oer(-3.31, -1.58, 8.87, 10.40, -78.20, -76.40), oer(1.52, 3.31, 8.87, 10.40, -78.20, -76.48), oer(-3.30, -1.58, 8.87, 10.39, -80.34, -78.54),
      oer(1.52, 3.32, 8.87, 10.39, -80.34, -78.62), oer(-0.70, 0.70, 8.87, 10.39, -83.51, -81.22), oer(-3.30, -1.58, 8.87, 10.39, -83.33, -81.53),
      oer(1.52, 3.32, 8.40, 10.39, -83.33, -81.60),
    ], gun: { whole: true, tris: 300, error: 0.01 } },
    // Her four screws, the wing pair forward of the inner.
    screw: { boxes: [
      { x: [7.0, 10.8], y: [-9.1, -5.2], z: [-88.3, -84.9], nodes: [44] },
      { x: [-10.8, -7.0], y: [-9.1, -5.2], z: [-88.3, -84.9], nodes: [44] },
      { x: [3.0, 6.7], y: [-9.1, -5.2], z: [-102.8, -99.4], nodes: [44] },
      { x: [-6.7, -3.0], y: [-9.1, -5.2], z: [-102.8, -99.4], nodes: [44] },
    ], min: 20, hullToo: true },
  },
});
