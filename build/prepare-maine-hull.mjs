// USS Maine off the owner's model of her -- "Maine" by vvmilleriii
// (https://skfb.ly/pzRIK), under Creative Commons Attribution 4.0, credited on
// the game's Credits screen -- through build/kriss-hull.mjs: her hull, her
// two towers, her funnels and her masts as one mesh, and every mounting of
// hers that trains cut free of her, each as the model drew it: her sixteen
// 16-inch in four quadruple turrets, two forward and two aft; her twin 5-inch
// dual-purpose mounts about her superstructure; and her twin 3-inch.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-maine-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { USN_CRUISER_PAINTS, usnCruiserPaint, BOOT } from './kriss-paints.mjs';

const box = (x0, x1, y0, y1, z0, z1) => ({ x: [x0, x1], y: [y0, y1], z: [z0, z1], hullToo: true });
/** A mounting whose middle stands at (x, z), `r` metres round, from y0 to y1. */
const at = (x, z, r, y0, y1) => box(x - r, x + r, y0, y1, z - r, z + r);
const pair = (x, z, r, y0, y1) => [at(x, z, r, y0, y1), at(-x, z, r, y0, y1)];

await prepare({
  name: 'Maine', script: 'build/prepare-maine-hull.mjs',
  src: 'assets/models/maine-maximum-compressed.glb',
  out: 'client/js/render/maineHull.data.js',
  credit: '"Maine" by vvmilleriii (https://skfb.ly/pzRIK), CC BY 4.0',
  // 280.8 m over all (921 ft 3 in), 11 m deep.
  loa: 280.8, draught: 11.0, bow: '+z', groupDepth: 2,
  paints: USN_CRUISER_PAINTS, paint: usnCruiserPaint, paintLines: [0, BOOT],
  deckFallback: 8, hullTris: 90000,
  rigging: { y: 16 },
  kinds: {
    // Her four quadruple 16-inch/50: No.1 on her forecastle and No.2
    // superfiring over it, trained ahead; No.3 superfiring over No.4 aft,
    // trained astern.
    main: { boxes: [
      box(-8.0, 8.0, 5.8, 10.8, 62.0, 89.0),
      box(-8.0, 8.0, 8.4, 14.2, 38.0, 70.0),
      box(-8.0, 8.0, 6.0, 14.6, -68.0, -44.0),
      box(-8.0, 8.0, 3.6, 11.4, -96.0, -68.0),
    ], gun: { whole: true, tris: 3600, error: 0.005, rests: [0, 0, Math.PI, Math.PI],
      // Each turned about the middle of its gunhouse, as the plan of her shows it.
      pivots: [[0, 71.0], [0, 47.0], [0, -51.0], [0, -76.0]] } },
    // Her ten twin 5-inch/54 dual-purpose mounts: four a side about her
    // superstructure and one on her centreline at each end of it.
    sec: { boxes: [
      at(0, 24.4, 3.4, 9.0, 16.0), ...pair(14.6, 6.2, 3.4, 6.0, 12.0), ...pair(9.2, 1.4, 3.8, 7.0, 16.0),
      ...pair(9.2, -8.4, 3.8, 7.0, 16.0), ...pair(14.6, -13.8, 3.4, 6.0, 12.0), at(0, -31.5, 3.4, 9.0, 16.0),
    ], gun: { whole: true, tris: 1600, error: 0.01 } },
    // Her twin 3-inch/50 dual-purpose mounts.
    dp: { boxes: [
      at(0, 31.6, 2.8, 8.0, 15.0), ...pair(10.4, 15.7, 3.0, 7.0, 15.0), ...pair(11.0, -25.0, 3.0, 7.0, 15.0), at(0, -39.5, 2.8, 8.0, 15.0),
    ], gun: { whole: true, tris: 1000, error: 0.01 } },
  },
});
