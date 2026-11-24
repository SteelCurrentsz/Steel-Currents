// IJN Amagi off the owner's model -- "Japanese Battlecruiser Amagi" by MPonceE
// (https://skfb.ly/6Utus), under Creative Commons Attribution 4.0, credited
// on the game's Credits screen -- through build/kriss-hull.mjs: her hull, her
// pagoda, her two funnels and her mainmast as one painted mesh, and her five
// twin 41 cm turrets, sixteen 14 cm casemate guns, eight twin 100 mm
// dual-purpose guns, her triple 25 mm and her four screws cut free of her.
//
// The model is one grey, every gun of a kind one piece of it: the casemate
// guns all of its node 11, the 100 mm twins its nodes 36 to 39 (a pair
// each), the deck 25 mm triples its nodes 40 to 50 and 59. The triple 25 mm
// she carries on the roofs of her three superfiring turrets stand on them and
// train with them.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-amagi-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { IJN_BB_PAINTS, ijnBBPaint, BOOT } from './kriss-paints.mjs';

// Her casemate guns, starboard side, as the model draws them: the middle of
// each shield [x, z], and the middle of its barrel [x, z].
const SEC = [
  [10.31, 35.63, 10.345, 38.37], [11.53, 25.88, 11.555, 28.6], [13.14, 11.23, 13.335, 13.97],
  [13.57, 2.21, 14.085, 4.89], [13.67, -8.89, 14.505, -6.31], [13.57, -19.49, 15.36, -17.47],
  [13.34, -29.57, 13.35, -32.3], [12.06, -34.95, 12.07, -37.69],
];
const SIDES = [1, -1];
const SEC_BOXES = SIDES.flatMap((s) => SEC.map(([px, pz, bx, bz]) => {
  const x = [Math.min(px, bx) - 1.25, Math.max(px, bx) + 1.25].map((v) => v * s).sort((a, b) => a - b);
  return { x, y: [4.0, 7.4], z: [Math.min(pz, bz) - 1.9, Math.max(pz, bz) + 1.9] };
}));
const SEC_PIVOTS = SIDES.flatMap((s) => SEC.map(([px, pz]) => [s * px, pz]));
const SEC_RESTS = SIDES.flatMap((s) => SEC.map(([px, pz, bx, bz]) => +(s * Math.atan2(bx - px, bz - pz)).toFixed(4)));

await prepare({
  name: 'Amagi', script: 'build/prepare-amagi-hull.mjs',
  src: 'assets/models/ImageToStl.com_japanese-battlecruiser-amagi-maximum-compressed.glb',
  out: 'client/js/render/amagiHull.data.js',
  credit: '"Japanese Battlecruiser Amagi" by MPonceE (https://skfb.ly/6Utus), CC BY 4.0',
  loa: 252, draught: 9.5, bow: '+z',
  hull: [8],
  paints: IJN_BB_PAINTS, paint: ijnBBPaint, paintLines: [0, BOOT], deckPaints: ['wood'],
  deckFallback: 7,
  // The model is drawn to a million and a half faces, her bridge alone a
  // third of a million: thinned to what is seen, never more than five
  // centimetres from where the model has it, her waterline kept exact.
  decimate: true, hullTris: 90000, hullError: 0.001, buckets: 60,
  kinds: {
    // Her sixteen 14 cm/50 3rd Year Type, eight a side in casemates in her
    // side under her forecastle deck, each a shield and its barrel, drawn
    // stowed along her side.
    // Each is cut by a box round its shield and its barrel, starboard side
    // forward to aft and then port, and trains about the middle of its
    // shield from where the model stows it: the forward six of a side
    // stowed pointing forward, the after two aft.
    sec: { boxes: SEC_BOXES, nodes: [11], min: 300,
      gun: { whole: true, tris: 540, error: 0.004, pivots: SEC_PIVOTS, rests: SEC_RESTS } },
    // Her eight twin 100 mm/65 Type 98, four a side abreast her funnels.
    dp: { auto: { regions: [{}], nodes: [36, 37, 38, 39], size: [1.5, 8], minFaces: 1000, gap: 0.1 },
      gun: { whole: true, tris: 1400, error: 0.01 } },
    // Her triple 25 mm Type 96 on her decks.
    aa: { auto: { regions: [{}], nodes: [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50], size: [1, 4.5], minFaces: 2000, gap: 0.3 },
      gun: { whole: true, tris: 2400, error: 0.006 } },
    // And the six lighter 25 mm mountings on her quarterdeck, three a side.
    aa2: { auto: { regions: [{}], nodes: [59], size: [1, 4.5], minFaces: 2000, gap: 0.3 },
      gun: { whole: true, tris: 1600, error: 0.006 } },
    // Her four screws, the inner pair aft of the outer.
    screw: { boxes: [
      { x: [0.6, 5.0], y: [-8.3, -4.0], z: [-110.4, -108.4] },
      { x: [-5.0, -0.6], y: [-8.3, -4.0], z: [-110.4, -108.4] },
      { x: [4.3, 8.7], y: [-8.9, -4.6], z: [-97.2, -95.2] },
      { x: [-8.7, -4.3], y: [-8.9, -4.6], z: [-97.2, -95.2] },
    ], min: 20, hullToo: true, nodes: [10] },
    // Her five twin 41 cm turrets: Nos. 1 and 2 forward, No.2 superfiring;
    // No.3 abaft her mainmast facing aft; Nos. 4 and 5 aft, No.4
    // superfiring. Each with what stands on its roof.
    main: { boxes: [
      { x: [-6, 6], y: [5.5, 10.5], z: [58, 83], nodes: [18] },
      { x: [-6, 6], y: [8.5, 13.5], z: [44, 68], nodes: [15, 16, 17] },
      { x: [-6, 6], y: [7.5, 12.5], z: [-44, -20], nodes: [19, 20, 21] },
      { x: [-6, 6], y: [7.5, 16.0], z: [-72, -48], nodes: [28, 29, 30] },
      { x: [-6, 6], y: [4.5, 9.0], z: [-86, -62], nodes: [22] },
    ], gun: { guns: 2, minLen: 4, tris: 6000, barrelTris: 1200, rests: [0, 0, Math.PI, Math.PI, Math.PI],
      // Each trains about the middle of its gunhouse, every one of the five
      // alike: the model's barbettes are hidden under them.
      pivots: [[0, 64.97], [0, 50.57], [0, -26.65], [0, -54.56], [0, -69.06]],
      test: (p) => p.pz1 - p.pz0 > 4 && p.px1 - p.px0 < 1.6 && p.py1 - p.py0 < 2.6 } },
  },
});
