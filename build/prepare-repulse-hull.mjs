// HMS Repulse off the owner's model of her -- "HMS Repulse (War Thunder)" by
// KojfDiscord (https://skfb.ly/pBB86), under Creative Commons Attribution
// 4.0, credited on the game's Credits screen -- through build/kriss-hull.mjs:
// her hull, her old tripod-masted bridge, her two funnels, her aircraft
// hangars and her boats as one mesh, and every mounting of hers that trains
// cut free of her, each as the model drew it: her three twin 15-inch turrets,
// A and B forward and Y aft; her three triple 4-inch Mk IX, one a side abreast
// her bridge and one on her after superstructure; her six single 4-inch Mk V
// high-angle guns; her three eight-barrelled pom-poms; her four quadruple
// .50-inch Vickers; and her four screws. (Her eight fixed 21-inch tubes stay
// with her hull, as the model draws them behind her side.)
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-repulse-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { RENOWN_PAINTS, renownPaint, BOOT } from './kriss-paints.mjs';

const TURRETS = [29, 68, 69, 79, 80];
const TRIPLES = [77, 80, 82, 120, 121, 122, 123, 124];
const HA = [102, 103, 104, 105, 106, 107, 108, 109, 110];
const POMPOM = [60, 61, 87, 94, 95, 96, 97, 98, 99, 119, 126];
const VICKERS = [111, 112, 113];
/** A mounting standing in the box the model draws round it, a hand clear all round. */
const around = (nodes) => (x0, x1, y0, y1, z0, z1) => ({ x: [x0 - 0.25, x1 + 0.25], y: [y0 - 0.15, y1 + 0.25], z: [z0 - 0.25, z1 + 0.25], nodes, hullToo: true });
const tri = around(TRIPLES), ha = around(HA), pom = around(POMPOM), mg = around(VICKERS);

await prepare({
  name: 'Repulse', script: 'build/prepare-repulse-hull.mjs',
  src: 'assets/models/hms_repulse_war_thunder-maximum-compressed.glb',
  out: 'client/js/render/repulseHull.data.js',
  credit: '"HMS Repulse (War Thunder)" by KojfDiscord (https://skfb.ly/pBB86), CC BY 4.0',
  // 242 m over all, 8.2 m draught.
  loa: 242, draught: 8.2, bow: '+z', groupDepth: 2,
  paints: RENOWN_PAINTS, paint: renownPaint, paintLines: [0, BOOT],
  deckFallback: 9, hullTris: 90000,
  // Her wires are what is long and thin over her bridge and her mastheads,
  // not B's barrels, which run out long and thin over A's roof.
  rigging: { y: 16 },
  kinds: {
    // Her three twin 15-inch Mk I: A on her forecastle and B superfiring over
    // it, trained ahead, and Y on her quarterdeck, trained astern. Taken in
    // that order, each takes what stands in its own box and none of the
    // next's.
    main: { boxes: [
      { x: [-4.8, 4.8], y: [6.4, 12.4], z: [53.6, 75.6], nodes: TURRETS },
      { x: [-4.8, 4.8], y: [9.5, 15.9], z: [37.8, 59.6], nodes: TURRETS },
      { x: [-4.8, 4.8], y: [2.6, 9.3], z: [-93.0, -71.0], nodes: TURRETS },
    ], gun: { guns: 2, minLen: 2, tris: 3600, barrelTris: 500, rests: [0, 0, Math.PI],
      // B's foot is the deck she stands on, which runs on under A's barrels: her
      // pivot is the middle of her barbette, under her gunhouse.
      pivots: [null, [0, 44.2], null], faces: [null, 4.4, null] } },
    // Her three triple 4-inch Mk IX, which she kept of the five she was
    // completed with: one a side on her shelter deck abreast her bridge, and
    // one on her after superstructure.
    sec: { boxes: [
      tri(7.08, 11.17, 14.63, 17.16, 15.16, 19.81), tri(-11.17, -7.08, 14.63, 17.16, 15.16, 19.81),
      tri(-2.05, 2.05, 9.76, 12.29, -68.19, -63.53),
    ], gun: { whole: true, tris: 2400, error: 0.01 } },
    // Her six single 4-inch Mk V high-angle guns: two a side about her
    // funnels, and one a side abreast her mainmast.
    dp: { boxes: [
      ha(10.83, 13.40, 6.83, 9.21, 11.46, 16.19), ha(-13.24, -10.67, 6.83, 9.21, 11.46, 16.19),
      ha(9.62, 12.19, 14.08, 16.46, -6.19, -1.46), ha(-12.03, -9.46, 14.08, 16.46, -6.19, -1.46),
      ha(6.39, 8.96, 9.65, 12.03, -45.56, -40.82), ha(-8.79, -6.22, 9.65, 12.03, -45.56, -40.82),
    ], gun: { whole: true, tris: 2400, error: 0.01 } },
    // Her three eight-barrelled 2-pounder pom-poms: one a side abreast her
    // forward funnel, and one on her after superstructure.
    pom: { boxes: [
      pom(10.13, 13.83, 14.58, 17.40, 6.69, 11.05), pom(-13.87, -10.16, 14.58, 17.40, 6.59, 11.01),
      pom(-2.21, 2.21, 12.97, 15.50, -55.49, -51.78),
    ], gun: { whole: true, tris: 2400, error: 0.01 } },
    // Her four quadruple .50-inch Vickers machine guns.
    mg: { boxes: [
      mg(6.31, 7.84, 17.19, 19.12, 8.59, 10.08), mg(-7.84, -6.31, 17.19, 19.11, 8.59, 10.08),
      mg(1.83, 3.35, 19.50, 21.42, -39.42, -37.94), mg(-3.35, -1.83, 19.50, 21.42, -39.42, -37.94),
    ], gun: { whole: true, tris: 700, error: 0.01 } },
    // Her four screws, the wing pair forward of the inner.
    screw: { boxes: [
      { x: [3.5, 7.4], y: [-7.0, -2.9], z: [-95.8, -92.9], nodes: [32] },
      { x: [-7.4, -3.5], y: [-7.0, -2.9], z: [-95.8, -92.9], nodes: [32] },
      { x: [0.3, 4.1], y: [-8.0, -4.0], z: [-106.8, -103.8], nodes: [32] },
      { x: [-4.1, -0.3], y: [-8.0, -4.0], z: [-106.8, -103.8], nodes: [32] },
    ], min: 20, hullToo: true },
  },
});
