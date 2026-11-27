// HMS Lion off the owner's model of her -- "HMS Lion (War Thunder) Sky
// Odyssey" by KojfDiscord (https://skfb.ly/pOtYP), under Creative Commons
// Attribution 4.0, credited on the game's Credits screen -- through
// build/kriss-hull.mjs: her hull, her bridge, her two funnels, her masts, her
// hangar, catapult and aircraft and her boats as one mesh, and every mounting
// of hers that trains cut free of her, each as the model drew it: her three
// triple 16-inch turrets, A and B forward and X aft; her eight twin 5.25-inch,
// four a side; and her six eight-barrelled pom-poms.
//
// The model is drawn a material to a piece, so every turret of hers is in the
// same few pieces: each mounting is found by where it stands, in those pieces.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-lion-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { RN_PAINTS, rnPaint, BOOT } from './kriss-paints.mjs';

const TURRETS = [92, 93, 94, 122];
const SEC = [74, 110, 111, 112, 113, 114, 115, 116, 117, 118];
const POM = [23, 26, 27, 28, 29, 31, 90];
/** A twin 5.25-inch gunhouse about (x, z), its deck at y. */
const sec = (x, z, y) => ({ x: [x - 3.0, x + 3.0], y: [y - 0.3, y + 3.0], z: [z - 3.0, z + 3.0], nodes: SEC, hullToo: true });
/** An eight-barrelled pom-pom about (x, z), its deck at y. */
const pom = (x, z, y) => ({ x: [x - 2.6, x + 2.6], y: [y - 0.3, y + 3.0], z: [z - 2.1, z + 2.1], nodes: POM, hullToo: true });

await prepare({
  name: 'Lion', script: 'build/prepare-lion-hull.mjs',
  src: 'assets/models/hms_lion_war_thunder_sky_odyssey-maximum-compressed.glb',
  out: 'client/js/render/lionHull.data.js',
  credit: '"HMS Lion (War Thunder) Sky Odyssey" by KojfDiscord (https://skfb.ly/pOtYP), CC BY 4.0',
  // 242.3 m over all (785 ft), 9.4 m deep load draught, as designed in 1938.
  loa: 242.3, draught: 9.4, bow: '+z', groupDepth: 2,
  paints: RN_PAINTS, paint: rnPaint, paintLines: [0, BOOT],
  deckFallback: 9, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0,
  rigging: { y: 18 },
  kinds: {
    // Her three triple 16-inch Mk IV: A on her forecastle and B superfiring
    // over it, trained ahead, and X aft, trained astern. A is taken first, so
    // B keeps only what stands over A's roof.
    main: { boxes: [
      { x: [-7, 7], y: [7.0, 11.2], z: [40, 72], nodes: TURRETS, hullToo: true },
      { x: [-7, 7], y: [10.3, 16.0], z: [24, 54], nodes: TURRETS, hullToo: true },
      { x: [-7, 7], y: [7.0, 11.5], z: [-82, -50], nodes: TURRETS, hullToo: true },
    ], gun: { guns: 3, minLen: 2, tris: 4000, barrelTris: 600, rests: [0, 0, Math.PI] } },
    // Her eight twin 5.25-inch Mk I, four a side: the forward and after
    // pairs on her upper deck, the middle two pairs a deck higher.
    sec: { boxes: [
      sec(12.55, 9.81, 7.6), sec(-12.52, 9.81, 7.6), sec(12.77, 0.17, 10.25), sec(-12.76, 0.17, 10.25),
      sec(12.62, -24.1, 10.25), sec(-12.65, -24.1, 10.25), sec(11.83, -37.1, 7.6), sec(-11.85, -37.1, 7.6),
    // The model draws their gunhouses with no barrels out of their ports,
    // so each is cut whole.
    ], gun: { whole: true, tris: 1800, error: 0.008 } },
    // Her six eight-barrelled 2-pounders: a pair abreast her bridge, a pair
    // abreast her fore funnel, and a pair on her after superstructure.
    pom: { boxes: [
      pom(7.4, 7.6, 13.68), pom(-7.4, 7.6, 13.68), pom(7.4, -0.3, 15.84), pom(-7.4, -0.3, 15.84),
      pom(3.0, -50.3, 14.49), pom(-2.9, -50.3, 14.49),
    ], gun: { whole: true, tris: 2000, error: 0.01 } },
  },
});
