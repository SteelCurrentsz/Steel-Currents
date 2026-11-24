// USS New Orleans off the owner's model of her -- "USS New Orleans (War
// Thunder)" by KojfDiscord (https://skfb.ly/pBB8p), under Creative Commons
// Attribution 4.0, credited on the game's Credits screen -- through
// build/kriss-hull.mjs: her hull, her bridge, her two funnels, her masts and
// her catapults as one mesh, and every mounting of hers that trains cut free
// of her, each as the model drew it: her three triple 8-inch/55, two forward
// and one aft; and her eight single 5-inch/25, four a side.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-neworleans-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { USN_CRUISER_PAINTS, usnCruiserPaint, BOOT } from './kriss-paints.mjs';

const box = (x0, x1, y0, y1, z0, z1) => ({ x: [x0, x1], y: [y0, y1], z: [z0, z1], hullToo: true });
const five = (x, z) => box(x - 2.6, x + 2.6, 5.8, 10.6, z - 2.6, z + 2.6);

await prepare({
  name: 'New Orleans', script: 'build/prepare-neworleans-hull.mjs',
  src: 'assets/models/uss_new_orleans_war_thunder-maximum-compressed.glb',
  out: 'client/js/render/neworleansHull.data.js',
  credit: '"USS New Orleans (War Thunder)" by KojfDiscord (https://skfb.ly/pBB8p), CC BY 4.0',
  // 179.2 m over all (588 ft), 6.9 m deep.
  loa: 179.2, draught: 6.9, bow: '+z', groupDepth: 2,
  paints: USN_CRUISER_PAINTS, paint: usnCruiserPaint, paintLines: [0, BOOT],
  deckFallback: 6, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0,
  rigging: { y: 14 },
  kinds: {
    // Her three triple 8-inch/55 Mk 15: No.1 on her forecastle and No.2
    // superfiring over it, trained ahead, and No.3 aft, trained astern.
    main: { boxes: [
      box(-5.4, 5.4, 6.6, 10.4, 45.0, 66.0),
      box(-5.4, 5.4, 8.4, 13.6, 30.0, 54.0),
      box(-5.4, 5.4, 4.6, 9.4, -70.0, -48.0),
    ], gun: { whole: true, tris: 2600, error: 0.005, rests: [0, 0, Math.PI] } },
    // Her eight single 5-inch/25 Mk 19, four a side on her boat deck.
    sec: { boxes: [26.8, 13.7, 4.8, -4.4].flatMap((z) => [five(7.2, z), five(-7.2, z)]),
      gun: { whole: true, tris: 1200, error: 0.01 } },
  },
});
