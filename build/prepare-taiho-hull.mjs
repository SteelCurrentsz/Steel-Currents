// IJN Taihō off the owner's model -- "IJN Hakuryuu" by SB-129
// (https://skfb.ly/oEKon), under Creative Commons Attribution 4.0, credited on
// the game's Credits screen -- through build/kriss-hull.mjs. The Hakuryū is
// the Taihō as she was to have been repeated, the armoured carrier of the
// 1942 programme: her hull, her flush bow, her great island to starboard with
// its funnel raked out over the water, and her armoured flight deck. Her hull,
// her island and her galleries are one mesh in the Shokaku's paint; her flight
// deck is taken up and its outline kept, for carrier.js to lay her runway over
// with her two lifts cut through it; and her guns cut free of her: her twelve
// twin 10 cm/65 Type 98 in their sponsons, six a side, and her twenty-two
// triple 25 mm Type 96 along her galleries and right aft.
//
// The model draws her a few metres off its own middle -- her island and its
// sponsons hang further out to starboard than her galleries do to port -- so
// she is moved across onto her hull's own centreline (`shiftX`) first.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-taiho-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { SHOKAKU_PAINTS, shokakuPaint } from './kriss-paints.mjs';

const DP = [40, 41, 42, 43, 44, 45];
const AA = [49, 50, 51, 52, 53, 54];
/** A mounting where the model stands it, a hand clear all round, trained on its own middle. */
const around = (nodes, pad) => (x0, x1, y0, y1, z0, z1) => ({
  x: [x0 - pad, x1 + pad], y: [y0 - 0.1, y1 + 0.2], z: [z0 - pad, z1 + pad],
  pivot: [+((x0 + x1) / 2).toFixed(2), +((z0 + z1) / 2).toFixed(2)], nodes, hullToo: true,
});
const dp = around(DP, 0.25), aa = around(AA, 0.2);

await prepare({
  name: 'Taiho', script: 'build/prepare-taiho-hull.mjs',
  src: 'assets/models/ijn_hakuryuu-maximum-compressed.glb',
  out: 'client/js/render/taihoHull.data.js',
  credit: '"IJN Hakuryuu" by SB-129 (https://skfb.ly/oEKon), CC BY 4.0',
  // 260.6 m over all, 9.59 m draught: the Taihō's.
  loa: 260.6, draught: 9.59, bow: '+z', groupDepth: 2, shiftX: 2.68,
  paints: SHOKAKU_PAINTS, paint: shokakuPaint, paintLines: [0],
  deckFallback: 9, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0, rigging: { y: 13 },
  // Her island, amidships on her starboard side; her flight deck flat from
  // her round-down to her bow.
  carrier: { minY: 9.5, island: { x0: -22.5, x1: -13.2, z0: -7, z1: 36, face: -13.4 } },
  kinds: {
    // Her twelve twin 10 cm/65 Type 98 high-angle mountings, the Akizukis'
    // gun, in sponsons under her deck edge: three a side forward of her
    // island and three a side aft.
    dp: { boxes: [
      dp(-18.89, -11.34, 7.92, 10.76, 84.66, 89.13), dp(11.34, 18.88, 7.92, 10.75, 84.52, 88.98),
      dp(-20.19, -12.64, 7.92, 10.75, 69.17, 73.63), dp(12.64, 20.19, 7.92, 10.75, 69.02, 73.48),
      dp(-21.48, -13.93, 7.92, 10.75, 53.28, 57.74), dp(13.93, 21.48, 7.92, 10.75, 53.13, 57.59),
      dp(-19.80, -12.25, 7.93, 10.76, -53.17, -48.71), dp(15.18, 22.73, 7.93, 10.76, -53.33, -48.86),
      dp(-19.63, -12.09, 7.92, 10.75, -75.50, -71.04), dp(15.19, 22.73, 7.92, 10.76, -75.65, -71.18),
      dp(-18.92, -11.37, 7.93, 10.76, -92.72, -88.26), dp(15.18, 22.72, 7.93, 10.76, -92.87, -88.41),
    ], min: 10, gun: { whole: true, tris: 900, error: 0.02 } },
    // Her twenty-two triple 25 mm Type 96: two on her island, eighteen in
    // their tubs along her galleries, and three on her quarterdeck under her
    // round-down.
    aa3: { boxes: [
      aa(-16.01, -13.69, 11.02, 13.71, 47.38, 50.54), aa(-16.84, -14.52, 11.02, 13.70, 43.56, 46.72),
      aa(-22.09, -18.94, 8.40, 11.09, 38.88, 41.20), aa(16.92, 20.07, 8.40, 11.08, 33.11, 35.43),
      aa(-22.09, -18.94, 8.40, 11.08, 33.10, 35.42), aa(17.18, 20.33, 8.40, 11.08, 27.25, 29.57),
      aa(-22.10, -18.95, 8.40, 11.08, 27.25, 29.57), aa(17.17, 20.33, 8.40, 11.08, 21.20, 23.51),
      aa(17.16, 20.31, 8.40, 11.08, 7.10, 9.42), aa(17.16, 20.32, 8.40, 11.08, 1.05, 3.37),
      aa(17.16, 20.31, 8.40, 11.08, -4.98, -2.66), aa(-17.67, -14.52, 8.42, 11.10, -16.32, -14.00),
      aa(-17.67, -14.52, 8.42, 11.10, -21.62, -19.31), aa(17.16, 20.31, 8.40, 11.08, -22.70, -20.38),
      aa(-17.67, -14.52, 8.42, 11.10, -26.93, -24.61), aa(17.16, 20.31, 8.40, 11.08, -29.00, -26.68),
      aa(-17.67, -14.52, 8.42, 11.10, -32.22, -29.90), aa(17.16, 20.31, 8.40, 11.08, -35.41, -33.09),
      aa(-17.67, -14.52, 8.42, 11.10, -37.52, -35.20),
      aa(-4.50, -2.18, 8.58, 11.26, -128.38, -125.22), aa(2.18, 4.50, 8.58, 11.26, -128.38, -125.22),
      aa(-1.17, 1.14, 8.58, 11.26, -130.21, -127.06),
    ], min: 10, gun: { whole: true, tris: 500, error: 0.02 } },
  },
});
