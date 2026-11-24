// HMS Renown off the owner's model of her -- "HMS Renown (War Thunder)" by
// KojfDiscord (https://skfb.ly/pBB8o), under Creative Commons Attribution
// 4.0, credited on the game's Credits screen -- through build/kriss-hull.mjs:
// her hull, her new bridge tower of 1939, her two funnels, her masts and her
// boats as one mesh, and every mounting of hers that trains cut free of her,
// each as the model drew it: her three twin 15-inch turrets, A and B forward
// and Y aft; her ten twin 4.5-inch in their BD gunhouses, three a side abreast
// her bridge and two a side aft; her three eight-barrelled pom-poms; her
// twenty Oerlikons; and her four screws.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-renown-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { RENOWN_PAINTS, renownPaint, BOOT } from './kriss-paints.mjs';

const TURRETS = [27, 28, 31, 64, 77, 106, 108];
const BD = [31, 52, 53, 54, 67];
const POMPOM = [72, 96, 97, 102, 113, 114, 115, 116, 117, 118];
const OERLIKON = [56, 57, 58, 60, 61, 62, 81, 82, 83, 84, 85, 86, 87, 88, 89];
/** A twin 4.5-inch BD gunhouse at (x, z), on her shelter deck, its barrels trained ahead (`dir` 1) or astern (-1). */
const bd = (x, z, dir = 1) => ({ x: x > 0 ? [x - 2.4, x + 2.6] : [x - 2.6, x + 2.4], y: [8.8, 11.6],
  z: dir > 0 ? [z - 2.0, z + 4.75] : [z - 4.75, z + 2.0], nodes: BD, hullToo: true });
/** An Oerlikon at (x, z), the foot of its shield at `y`. */
const oer = (x, y, z) => ({ x: [x - 1.3, x + 1.3], y: [y - 1.1, y + 1.7], z: [z - 1.3, z + 1.3], nodes: OERLIKON, hullToo: true });

await prepare({
  name: 'Renown', script: 'build/prepare-renown-hull.mjs',
  src: 'assets/models/hms_renown_war_thunder-maximum-compressed.glb',
  out: 'client/js/render/renownHull.data.js',
  credit: '"HMS Renown (War Thunder)" by KojfDiscord (https://skfb.ly/pBB8o), CC BY 4.0',
  // 242 m over all, 8.2 m draught.
  loa: 242, draught: 8.2, bow: '+z', groupDepth: 2,
  paints: RENOWN_PAINTS, paint: renownPaint, paintLines: [0, BOOT],
  deckFallback: 9, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0,
  // Her wires are what is long and thin over her bridge and her mastheads,
  // not B's barrels, which run out long and thin over A's roof.
  rigging: { y: 16 },
  kinds: {
    // Her three twin 15-inch Mk I: A on her forecastle and B superfiring over
    // it, trained ahead, and Y on her quarterdeck, trained astern. Taken in
    // that order, each takes what stands in its own box and none of the
    // next's.
    main: { boxes: [
      { x: [-4.8, 4.8], y: [6.3, 12.3], z: [54.4, 77.5], nodes: TURRETS },
      { x: [-4.8, 4.8], y: [9.3, 15.8], z: [38.3, 62.0], nodes: TURRETS },
      { x: [-4.8, 4.8], y: [3.0, 9.6], z: [-93.0, -68.5], nodes: TURRETS },
    ], gun: { guns: 2, minLen: 2, tris: 3600, barrelTris: 500, rests: [0, 0, Math.PI],
      // B's foot is the deck she stands on, which runs on under A's barrels: her
      // pivot is the middle of her barbette, under her gunhouse.
      pivots: [null, [0, 45.1], null] } },
    // Her ten twin 4.5-inch Mk III in BD gunhouses: three a side abreast her
    // bridge and forward funnel trained ahead, two a side aft of her mainmast
    // trained astern.
    sec: { boxes: [
      bd(9.7, 16.1), bd(-9.7, 16.1), bd(10.3, 9.35), bd(-10.3, 9.35), bd(10.3, 2.7), bd(-10.3, 2.7),
      bd(9.75, -38.1, -1), bd(-9.75, -38.1, -1), bd(9.75, -44.5, -1), bd(-9.75, -44.5, -1),
    ], gun: { guns: 2, minLen: 0.6, tris: 1800, barrelTris: 200,
      rests: [0, 0, 0, 0, 0, 0, Math.PI, Math.PI, Math.PI, Math.PI] } },
    // Her three eight-barrelled 2-pounder Mk VI: one a side on the platforms
    // abreast her forward funnel, and one on her after superstructure.
    pom: { boxes: [
      { x: [4.9, 9.3], y: [15.3, 18.5], z: [-3.0, 2.0], nodes: POMPOM, hullToo: true },
      { x: [-9.3, -4.9], y: [15.3, 18.5], z: [-3.0, 2.0], nodes: POMPOM, hullToo: true },
      { x: [-2.4, 2.4], y: [9.8, 12.8], z: [-66.3, -61.8], nodes: POMPOM, hullToo: true },
    ], gun: { whole: true, tris: 2400, error: 0.01 } },
    // Her twenty 20 mm Oerlikons, behind their shields about her bridge,
    // her funnels and her after superstructure.
    aa1: { boxes: [
      oer(5.08, 18.32, 28.68), oer(-4.56, 18.32, 28.59), oer(5.82, 12.99, 12.31), oer(-5.31, 13.04, 12.27),
      oer(-4.6, 15.69, 5.77), oer(5.13, 15.75, 5.62), oer(9.88, 14.86, -7.8), oer(-9.38, 14.86, -7.8),
      oer(7.97, 16.78, -10.18), oer(-7.45, 16.78, -10.19), oer(-13.59, 9.7, -18.87), oer(13.14, 9.7, -18.89),
      oer(10.68, 10.61, -21.92), oer(-11.18, 10.61, -21.92), oer(-13.59, 9.7, -24.65), oer(13.14, 9.7, -24.71),
      oer(-2.95, 13.1, -46.92), oer(3.05, 13.1, -47.52), oer(3.02, 11.96, -53.49), oer(-3.5, 11.96, -53.49),
    ], gun: { whole: true, tris: 500, error: 0.01 } },
    // Her four screws, the wing pair forward of the inner.
    screw: { boxes: [
      { x: [3.2, 6.8], y: [-7.0, -2.6], z: [-94.0, -89.8], nodes: [110] },
      { x: [-6.8, -3.2], y: [-7.0, -2.6], z: [-94.0, -89.8], nodes: [110] },
      { x: [0.3, 4.7], y: [-8.1, -3.6], z: [-104.2, -100.2], nodes: [110] },
      { x: [-4.7, -0.3], y: [-8.1, -3.6], z: [-104.2, -100.2], nodes: [110] },
    ], min: 20, hullToo: true },
  },
});
