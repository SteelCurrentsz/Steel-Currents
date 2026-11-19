// IJN Tone off the owner's model of her -- "IJN Tone War Thunder" by Jimphf
// (https://skfb.ly/pFsv7), under Creative Commons Attribution 4.0, credited
// on the game's Credits screen -- through build/kriss-hull.mjs: her hull, her
// bridge, her funnel, her masts, her aircraft deck with its catapults and
// crane, and her boats as one mesh in the fleet's grey, and every mounting of
// hers that trains cut free of her, each as the model drew it: her four twin
// 20.3 cm turrets all forward of her bridge, her four twin 12.7 cm Type 89 in
// their gunhouses abreast her funnel, her twelve triple and four twin 25 mm,
// and her four screws. (Her four triple banks of 61 cm tubes stay with her
// hull, as the model stows them in her side under her aircraft deck.)
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-tone-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { IJN_PAINTS, ijnPaint, BOOT } from './kriss-paints.mjs';

// The model draws each kind of gun in a piece of its own, every mounting of a
// kind in the one piece: a mounting is what of that piece stands in its box.
const TURRETS = [39, 40, 41, 42, 8, 38, 60, 62];
const HA = [67, 68, 69];
const TRIPLES = [91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103];
const TWINS = [25, 28, 34, 58, 65, 86, 87, 88];
/** A light gun's box round where the model stands it, a hand clear all round. */
const around = (nodes) => (x0, x1, y0, y1, z0, z1) => ({ x: [x0 - 0.3, x1 + 0.3], y: [y0 - 0.2, y1 + 0.3], z: [z0 - 0.3, z1 + 0.3], nodes, hullToo: true });
const tri = around(TRIPLES), twin = around(TWINS);

await prepare({
  name: 'Tone', script: 'build/prepare-tone-hull.mjs',
  src: 'assets/models/ijn_tone_war_thunder-maximum-compressed.glb',
  out: 'client/js/render/toneHull.data.js',
  credit: '"IJN Tone War Thunder" by Jimphf (https://skfb.ly/pFsv7), CC BY 4.0',
  // 201.6 m over all, 6.23 m draught.
  loa: 201.6, draught: 6.23, bow: '+z', groupDepth: 2,
  // Her decks are planked where they lie flat and low -- her forecastle, her
  // upper deck, her aircraft deck and the platforms on them -- and grey
  // where they slope or stand high: the sloping back of her trunked funnel,
  // her boats' covers, the tops of her bridge and her directors.
  paints: IJN_PAINTS, paintLines: [0, BOOT],
  paint: (f) => (f.up && !f.kind && f.cy > 2 && f.cy < 12.5 && f.ny > 0.97 ? 'deck' : ijnPaint({ ...f, up: false })),
  deckFallback: 6, hullTris: 70000,
  kinds: {
    // Her four twin 20.3 cm/50 turrets, all forward of her bridge: No.1 on
    // her forecastle and No.2 superfiring over it, both trained ahead; No.3
    // and No.4 behind them on her upper deck, trained astern. Taken in that
    // order, each takes what stands in its own box and none of the next's.
    main: { boxes: [
      { x: [-3.3, 3.3], y: [4.0, 8.6], z: [60.2, 75.5], nodes: TURRETS },
      { x: [-3.3, 3.3], y: [6.9, 11.5], z: [51.4, 66.6], nodes: TURRETS },
      { x: [-3.3, 3.3], y: [4.0, 8.6], z: [38.0, 53.2], nodes: TURRETS },
      { x: [-3.3, 3.3], y: [4.0, 8.6], z: [22.9, 38.1], nodes: TURRETS },
    ], gun: { guns: 2, minLen: 2, tris: 3000, barrelTris: 400, rests: [0, 0, Math.PI, Math.PI] } },
    // Her four twin 12.7 cm/40 Type 89 in their gunhouses, in sponsons two a
    // side abreast her funnel, each trained out on her beam.
    sec: { boxes: [
      { x: [5.3, 12.4], y: [7.0, 10.6], z: [-4.2, 0.5], nodes: HA, hullToo: true },
      { x: [-12.4, -5.3], y: [7.0, 10.6], z: [-4.2, 0.5], nodes: HA, hullToo: true },
      { x: [5.3, 12.4], y: [7.0, 10.6], z: [-17.1, -12.4], nodes: HA, hullToo: true },
      { x: [-12.4, -5.3], y: [7.0, 10.6], z: [-17.1, -12.4], nodes: HA, hullToo: true },
    ], gun: { guns: 2, minLen: 1.0, tris: 2400, barrelTris: 300, rests: [Math.PI / 2, -Math.PI / 2, Math.PI / 2, -Math.PI / 2] } },
    // Her twelve triple 25 mm Type 96: two on her bridge front, two abreast
    // her foremast, two on their towers abaft her mainmast, and six along her
    // aircraft deck.
    aa3: { boxes: [
      tri(1.08, 3.13, 10.94, 12.16, 19.96, 21.64), tri(-3.03, -0.98, 10.94, 12.15, 19.96, 21.64),
      tri(4.86, 6.91, 6.99, 8.21, 16.2, 17.88), tri(-6.81, -4.76, 6.99, 8.21, 16.2, 17.88),
      tri(3.88, 6.45, 9.4, 10.64, -31.59, -29.7), tri(-6.38, -3.81, 9.4, 10.64, -31.59, -29.7),
      tri(5.26, 7.15, 4.55, 5.79, -62.12, -59.55), tri(-7.18, -5.29, 4.55, 5.8, -62.06, -59.49),
      tri(4.24, 6.22, 4.55, 5.8, -72.86, -70.27), tri(-7.1, -5.21, 4.55, 5.8, -70.98, -68.41),
      tri(4.11, 6.68, 4.55, 5.8, -79.47, -77.57), tri(-6.69, -4.12, 4.55, 5.8, -79.47, -77.57),
    ], gun: { whole: true, tris: 1600, error: 0.01 } },
    // Her four twin 25 mm, in tubs on her funnel casing and about her mainmast.
    aa2: { boxes: [
      twin(2.99, 5.22, 10.97, 12.27, -12.24, -9.93), twin(-5.23, -2.99, 10.97, 12.27, -12.24, -9.93),
      twin(-3.66, -1.42, 10.97, 12.27, -18.13, -15.82), twin(2.04, 4.28, 10.97, 12.27, -21.18, -18.87),
    ], gun: { whole: true, tris: 1600, error: 0.01 } },
    // Her four screws, the wing pair forward of the inner.
    screw: { boxes: [
      { x: [4.4, 8.6], y: [-5.4, -1.5], z: [-76.4, -73.5] },
      { x: [-8.6, -4.4], y: [-5.4, -1.5], z: [-76.4, -73.5] },
      { x: [1.2, 5.2], y: [-6.0, -2.0], z: [-86.5, -83.8] },
      { x: [-5.2, -1.2], y: [-6.0, -2.0], z: [-86.5, -83.8] },
    ], min: 20, hullToo: true },
  },
});
