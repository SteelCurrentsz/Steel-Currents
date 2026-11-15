// USS Oregon off the owner's model of her -- "US Super Battleship Oregon" by
// 全斗焕 (https://skfb.ly/oHGQC), under Creative Commons Attribution 4.0,
// credited on the game's Credits screen -- through build/textured-hull.mjs:
// her hull, her superstructure, her funnels, her masts and every fitting on
// her as one painted mesh, and every mounting of hers that trains -- her five
// twin 18-inch turrets, her eight 5-inch/54 twins, her ten 40 mm Bofors
// quadruples and her 20 mm Oerlikons, twins and singles -- cut free of her,
// each as the model drew it; and her four screws.
//
// A Sketchfab export of the whole ship by the modeller of the Tillman's
// Rhode Island, laid out as that one is: every piece named for what it is
// (HP_AGM_ a main turret, HP_AGS_ a 5-inch twin, HP_AGA_ an AA mounting), her
// hull in sections -- bow, midbody, stern -- stepped and cracked where they
// meet under her waterline, which are plated over again in one skin (`loft`).
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-oregon-hull.mjs [model.glb]
import { prepare } from './textured-hull.mjs';

/** A slim piece of a 40 mm quadruple cocked up high behind its shield: a barrel. */
const bofors = (p) => p.px1 - p.px0 < 0.45 && p.py0 > 1.5 && p.pz0 < 1.5 && (p.py1 - p.py0 > 0.7 || p.pz1 > 1.0);
// Her hull's sections, and not the barbette caps hung off them.
const SECTIONS = /^HP_(Bow|MidFront|MidBack|Stern)_[0-9A-F]{8}-/;

await prepare({
  name: 'Oregon', script: 'build/prepare-oregon-hull.mjs', prefix: 'OREGON',
  src: 'assets/models/us_super_battleship_oregon-maximum-compressed.glb',
  out: 'client/js/render/oregonHull.data.js',
  credit: '"US Super Battleship Oregon" by 全斗焕 (https://skfb.ly/oHGQC), CC BY 4.0',
  // The model's 0.19 units stem to stern brought up to 300 m over all, which
  // makes her 38.5 m across.
  loa: 300,
  // The model stands her on its y = 0 well over her waterline: the top of her
  // boot-topping, where the atlas's grey meets her bottom's red, is 13.2 m
  // down it, and she is floated there -- her keel 10.5 m under her waterline,
  // eight and a half metres of freeboard amidships.
  sink: +(process.env.SINK ?? -13.2),
  shell: SECTIONS,
  painted: SECTIONS,
  // Nothing of hers is drawn see-through.
  drop: /^$/,
  bootTop: +(process.env.BOOT ?? 0.3),
  // Her guns' atlases read whole and sharp: the black wedges of her muzzles
  // end on the corners of the grey faces of the chase beside them.
  crisp: /^HP_AG[MS]_/,
  loft: { aft: +(process.env.LOFT_AFT ?? -99.5), hull: SECTIONS },
  kinds: {
    // Her five twin 18-inch turrets: A and B forward, B superfiring; X, Y and
    // Z aft facing astern, Y superfiring over Z. Each a piece of the model of
    // its own, and the barrels of each superfiring turret lie over the roof of
    // the one before it.
    // Each trains about the middle of its barbette's ring -- the foot of its
    // gunhouse, less the skirt hung off the back of it.
    main: { house: /^HP_AGM_/, byPiece: true, count: 5, ring: true },
    // Her eight 5-inch/54 twins, four a side.
    sec: { house: /^HP_AGS_/, gap: 0.6, min: 150, reach: 3, count: 8 },
    // Her 40 mm Bofors quadruples, the model drawing them in pairs, one either
    // side of her centreline, in one piece.
    aa40: { house: /^HP_AGA_(1(\.\d+)?|2)_/, gap: 0.6, min: 400, reach: 2, count: 10 },
    // Her 20 mm Oerlikon twins behind their shields along her deck edges, some
    // a piece each and some drawn two to a piece.
    aa20t: { house: /^HP_AGA_([6-9]|1[0-3]|1[89]|2[0145])(\.\d+)?_/, gap: 0.3, min: 300, reach: 1, count: 22 },
    // And her single Oerlikons, on her superstructure's galleries.
    aa20s: { house: /^HP_AGA_(2[2367]|4[2-9])(\.\d+)?_/, gap: 0.05, min: 200, reach: 1, count: 14 },
    screw: { house: /Propeller/, gap: 0.3, count: 4 },
  },
  // Her Bofors are stowed cocked well up, their loaders' platforms reaching out
  // further from the pivot than their muzzles: they face their highest points.
  upKinds: ['aa40'],
  guns: {
    // Two barrels out of each gunhouse; the ladder rungs up its face are not
    // barrels, however far forward they stand.
    main: { guns: 2, minLen: 2, test: (p) => p.pz1 - p.pz0 > 5 && p.px1 - p.px0 < 2 },
    sec: { guns: 2, minLen: 1.0 },
    // What elevates on a quadruple is its barrels, about trunnions at their
    // foot; its bores are off the whole of them -- bare tubes, a ring of points
    // at each end -- a pair to a side.
    aa40: { guns: 2, minLen: 0.5, baseTrunnion: true, test: bofors, fitTest: bofors },
    aa20t: { whole: true },
    aa20s: { whole: true },
  },
});
