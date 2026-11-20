// IJN Aoba off the owner's model of her -- "IJN Aoba (War Thunder)" by
// KojfDiscord (https://skfb.ly/pGu8Y), under Creative Commons Attribution 4.0,
// credited on the game's Credits screen -- through build/kriss-hull.mjs: her
// hull, her bridge, her two funnels, her masts, her catapult and crane and her
// boats as one mesh in the fleet's grey, and every mounting of hers that
// trains cut free of her, each as the model drew it: her three twin 20.3 cm
// turrets, two forward and one aft; her four single 12 cm/45 high-angle guns
// in their sponsons on her upper deck abreast her funnels; her two quadruple
// banks of 61 cm tubes on her upper deck aft; her ten twin and fifteen single
// 25 mm; and her four screws.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-aoba-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { IJN_PAINTS, ijnPaint, BOOT } from './kriss-paints.mjs';

// The model draws each kind of gun in a handful of pieces of its own, every
// mounting of a kind in the same ones: a mounting is what of them stands in
// its box.
const TURRETS = [6, 19, 20, 21, 56, 68];
const HA = [42, 90, 91, 92, 93, 94];
const LIGHT = [7, 12, 13, 14, 15, 17, 23, 45, 47, 57, 58, 59, 60, 62, 65, 67, 73, 86, 88];
/** A 25 mm mounting at (x, z), its deck at `y`, its barrels trained out over her side. */
const light = (x, y, z, h = 1.6) => ({ x: x > 0 ? [x - 1.0, x + 1.9] : [x - 1.9, x + 1.0], y: [y - 0.2, y + h], z: [z - 1.0, z + 1.0], nodes: LIGHT, hullToo: true });
/** A 12 cm/45 in her sponson at z, port (+1) or starboard (-1), its barrel trained out on the beam. */
const ha = (side, z) => ({ x: side > 0 ? [4.9, 11.0] : [-11.0, -4.9], y: [4.4, 7.5], z: [z - 1.7, z + 1.7], nodes: HA, hullToo: true });

await prepare({
  name: 'Aoba', script: 'build/prepare-aoba-hull.mjs',
  src: 'assets/models/ijn_aoba_war_thunder-maximum-compressed.glb',
  out: 'client/js/render/aobaHull.data.js',
  credit: '"IJN Aoba (War Thunder)" by KojfDiscord (https://skfb.ly/pGu8Y), CC BY 4.0',
  // 185.17 m over all, 5.66 m draught.
  loa: 185.17, draught: 5.66, bow: '+z', groupDepth: 2,
  // Her decks are planked where they lie flat and low -- her forecastle, her
  // upper deck and her shelter deck -- and grey where they slope or stand
  // high.
  paints: IJN_PAINTS, paintLines: [0, BOOT],
  paint: (f) => (f.up && !f.kind && f.cy > 2 && f.cy < 12 && f.ny > 0.97 ? 'deck' : ijnPaint({ ...f, up: false })),
  deckFallback: 6, hullTris: 70000,
  kinds: {
    // Her three twin 20.3 cm/50: No.1 on her forecastle and No.2 superfiring
    // over it, trained ahead, and No.3 on her quarterdeck, trained astern.
    // Taken in that order, each takes what stands in its own box and none of
    // the next's.
    main: { boxes: [
      { x: [-3.6, 3.6], y: [2.7, 8.7], z: [52.0, 67.2], nodes: TURRETS },
      { x: [-3.6, 3.6], y: [5.1, 11.9], z: [43.9, 59.2], nodes: TURRETS },
      { x: [-3.6, 3.6], y: [0.7, 7.6], z: [-60.6, -44.5], nodes: TURRETS },
    ], gun: { guns: 2, minLen: 2, tris: 3000, barrelTris: 400, rests: [0, 0, Math.PI] } },
    // Her four single 12 cm/45 10th Year Type high-angle guns, in sponsons
    // two a side on her upper deck abreast her funnels, trained out on her
    // beam.
    sec: { boxes: [ha(1, 8.0), ha(-1, 8.0), ha(1, -6.0), ha(-1, -6.0)],
      gun: { guns: 1, minLen: 1.0, tris: 2400, barrelTris: 200, rests: [Math.PI / 2, -Math.PI / 2, Math.PI / 2, -Math.PI / 2] } },
    // Her two quadruple banks of 61 cm Type 92 tubes, one a side on her upper
    // deck abaft her mainmast.
    tubes: { boxes: [
      { x: [2.9, 7.7], y: [4.2, 6.3], z: [-29.8, -19.4] },
      { x: [-7.7, -2.9], y: [4.2, 6.3], z: [-29.8, -19.4] },
    ], gun: { tubes: 4, tris: 1500, rest: 'axis' } },
    // Her ten twin 25 mm Type 96 on her shelter deck about her funnels.
    aa2: { boxes: [
      light(3.2, 8.0, 5.0), light(-3.2, 8.0, 5.0), light(3.2, 8.0, -4.6), light(-3.2, 8.0, -4.6),
      light(3.7, 8.0, -12.6), light(-3.7, 8.0, -12.6), light(5.7, 8.0, -15.5), light(-5.7, 8.0, -15.5),
      light(7.3, 8.0, -19.8), light(-7.3, 8.0, -19.8),
    ], gun: { whole: true, tris: 900, error: 0.01 } },
    // Her fifteen single 25 mm: eight about No.2 on her forecastle, six along
    // her upper deck aft, and one on her searchlight tower.
    aa1: { boxes: [
      light(6.4, 5.4, 36.9), light(-6.4, 5.4, 36.9), light(6.3, 5.4, 40.6), light(-6.3, 5.4, 40.6),
      light(6.1, 5.4, 44.3), light(-6.1, 5.4, 44.3), light(3.8, 5.4, 47.6), light(-3.8, 5.4, 47.6),
      light(6.7, 4.4, -33.3), light(-6.7, 4.4, -33.3), light(6.5, 4.4, -38.4), light(-6.5, 4.4, -38.4),
      light(4.9, 3.7, -59.6), light(-4.9, 3.7, -59.6),
      { x: [-0.7, 0.7], y: [9.7, 11.6], z: [-12.0, -10.2], nodes: LIGHT, hullToo: true },
    ], gun: { whole: true, tris: 600, error: 0.01 } },
    // Her four screws, the wing pair forward of the inner.
    screw: { boxes: [
      { x: [3.4, 6.8], y: [-5.4, -1.8], z: [-73.6, -71.2], nodes: [31] },
      { x: [-6.8, -3.4], y: [-5.4, -1.8], z: [-73.6, -71.2], nodes: [31] },
      { x: [0.7, 4.1], y: [-5.6, -2.1], z: [-80.4, -78.0], nodes: [31] },
      { x: [-4.1, -0.7], y: [-5.6, -2.1], z: [-80.4, -78.0], nodes: [31] },
    ], min: 20, hullToo: true },
  },
});
