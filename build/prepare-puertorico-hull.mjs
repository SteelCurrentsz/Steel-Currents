// USS Puerto Rico off the owner's model of her -- "Puerto Rico B (World of
// Warships)" by KojfDiscord (https://skfb.ly/pLHuB), under Creative Commons
// Attribution 4.0, credited on the game's Credits screen -- through
// build/kriss-hull.mjs: her hull, her tower, her funnels and her masts as one
// mesh painted in Measure 21.
//
// The model draws her without her guns: her four barbettes are empty and her
// secondaries' gunhouses stand on their plinths without a barrel to them. So
// her guns are the Alaska's, her half-sister's, as the owner asked -- the
// Alaska's own triple 12-inch turret, cut from the owner's model of her (see
// build/prepare-alaska-hull.mjs), set on each of her four barbettes; the
// Alaska's twin 5"/38 in place of each of the model's empty gunhouses, which
// are cut off her; and the Alaska's quadruple Bofors in tubs about her
// upperworks, where an American heavy ship of 1945 carried them (see
// build/borrow-guns.mjs).
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-puertorico-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { USN_PAINTS, usnPaint, BOOT } from './kriss-paints.mjs';
import { borrowGuns, plantGuns } from './borrow-guns.mjs';

const OUT = 'client/js/render/puertoricoHull.data.js';
/** One of the model's empty gunhouses: 5.4 m by 5 m, from the plate it stands on to its roof. */
const sec = (x, z, y0 = 6.35, y1 = 9.8) => ({ x: [x - 2.85, x + 2.85], y: [y0, y1], z: [z - 2.65, z + 2.65], hullToo: true });

await prepare({
  name: 'Puerto Rico', script: 'build/prepare-puertorico-hull.mjs',
  src: 'assets/models/puerto_rico_b_world_of_warships-maximum-compressed.glb',
  out: OUT,
  credit: '"Puerto Rico B (World of Warships)" by KojfDiscord (https://skfb.ly/pLHuB), CC BY 4.0',
  // 246.4 m over all and 9.7 m draught: the Alaskas'.
  loa: 246.4, draught: 9.7, bow: '+z', groupDepth: 2,
  paints: USN_PAINTS, paint: usnPaint, paintLines: [0, BOOT],
  deckFallback: 5, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0,
  rigging: { y: 14 },
  kinds: {
    // The empty gunhouses of her secondaries, each cut off her for the
    // Alaska's twin 5"/38: three a side in her waist, the forward pair trained
    // ahead, the middle pair abeam and the after pair astern, and one on her
    // centreline before her bridge and one abaft her after funnel.
    sec: { boxes: [
      sec(0, 35.49, 9.1, 12.0), sec(10.27, 16.82), sec(-10.27, 16.82), sec(10.27, -0.12), sec(-10.27, -0.12),
      sec(10.27, -17.06), sec(-10.27, -17.06), sec(0, -34.93, 9.1, 12.0),
    ], gun: { whole: true, tris: 300, error: 0.02, rests: [0, 0, 0, Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI, Math.PI] } },
  },
});

// Her guns, her half-sister's (see build/borrow-guns.mjs).
await borrowGuns(OUT, { sec: ['alaska', 'sec'] });
await plantGuns(OUT, {
  // The Alaska's triple 12-inch on each of her four barbettes: Able on her
  // forecastle and Baker over it, trained ahead; Charlie over Dog aft.
  main: { from: ['alaska', 'main'], r: 3, at: [[0, 65.2, 0], [0, 48.8, 0], [0, -48.4, Math.PI], [0, -64.7, Math.PI]] },
  // And her quadruple Bofors, in the model's eight empty tubs: a pair
  // abreast her forward turrets, a pair abreast her after funnel, a pair
  // abreast her after turrets, and a pair on her fantail.
  aa4: { from: ['alaska', 'quad'], r: 1.2, at: [
    [10.1, 33.6, Math.PI / 2], [-10.1, 33.6, -Math.PI / 2], [10.65, -30.8, Math.PI / 2], [-10.65, -30.8, -Math.PI / 2],
    [10.1, -83.9, Math.PI / 2], [-10.1, -83.9, -Math.PI / 2], [4.3, -116.4, Math.PI], [-4.3, -116.4, Math.PI],
  ] },
});
