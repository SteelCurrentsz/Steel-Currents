// IJN Yamato off the owner's model of her -- "Yamato" by vvmilleriii
// (https://skfb.ly/pzJ8Q), under Creative Commons Attribution 4.0, credited
// on the game's Credits screen -- through build/kriss-hull.mjs: her hull, her
// tower, her funnel and her mainmast as one painted mesh, and every gun of
// her 1945 fit cut free of her, each as the model draws it: her three triple
// 46 cm turrets, her two triple 15.5 cm (the wing pair landed in 1944 for
// more high-angle guns), her twelve twin 12.7 cm -- six in their shields, six
// open -- her triple 25 mm in their shields and in the open, and her four
// screws.
//
// The model draws each kind of gun as its own piece (named for it in the
// model's materials: JGM164_460mm45, JGS156_155mm_60, JGS157_127mm40 and
// JGS009_127mm40, JGA004_25mm_Triple, JGA010_25mm), so every mounting is
// found by its piece and where it stands.
//
//   node build/prepare-yamato-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { IJN_BB_PAINTS, ijnBBPaint, BOOT } from './kriss-paints.mjs';

const BARREL = (p) => p.pz1 - p.pz0 > 4 && p.px1 - p.px0 < 1.6 && p.py1 - p.py0 < 1.6;

await prepare({
  name: 'Yamato', script: 'build/prepare-yamato-hull.mjs',
  src: 'assets/models/yamato-maximum-compressed.glb',
  out: 'client/js/render/yamatoHull.data.js',
  credit: '"Yamato" by vvmilleriii (https://skfb.ly/pzJ8Q), CC BY 4.0',
  // 263 m over all, floated at her 10.4 m trial draught: her keel, the lowest
  // of her, that far under.
  loa: 263.0, draught: 10.4, bow: '+z',
  hull: [142, 144, 146],
  paints: IJN_BB_PAINTS, paint: ijnBBPaint, paintLines: [0, BOOT], deckPaints: ['wood'],
  deckFallback: 8.5, hullTris: 90000,
  rigging: { y: 14 },
  floaters: {},
  // Her rigging kept apart from her hull: it stops no gun.
  wireCards: true,
  kinds: {
    // Her twelve twin 12.7 cm/40 Type 89 in their shields, three a side
    // abreast her funnel.
    ha: { auto: { regions: [{}], nodes: [50, 52, 54], size: [5, 8.5], minFaces: 1500, gap: 0.05 }, gun: { whole: true, tris: 1200, error: 0.02 } },
    // And the six open ones the 1944 refit put where her wing 15.5 cm turrets stood.
    hb: { auto: { regions: [{}], nodes: [108, 110, 112, 114, 116, 118], size: [4, 8], minFaces: 1500, gap: 0.05 }, gun: { whole: true, tris: 1200, error: 0.02 } },
    // Her 25 mm Type 96 triples in their blast shields.
    aa3: { auto: { regions: [{}], nodes: [78, 80], size: [2.2, 5.0], minFaces: 200, gap: 0.03, each: 363 }, gun: { whole: true, tris: 300, error: 0.03 } },
    // And open on their pedestals, about her decks and her superstructure.
    aa2: { auto: { regions: [{}], nodes: [82, 84, 86, 88, 90, 92, 94, 96], size: [1.4, 3.2], minFaces: 900, gap: 0.03, each: 1855 }, gun: { whole: true, tris: 400, error: 0.03 } },
    // Her four three-bladed screws, the inner pair aft of the outer.
    screw: { boxes: [
      { x: [1.2, 6.0], y: [-9.5, -5.2], z: [-112.4, -109.3] },
      { x: [-6.0, -1.2], y: [-9.5, -5.2], z: [-112.4, -109.3] },
      { x: [6.2, 11.0], y: [-9.3, -5.0], z: [-100.6, -97.5] },
      { x: [-11.0, -6.2], y: [-9.3, -5.0], z: [-100.6, -97.5] },
    ], min: 20, nodes: [44] },
    // Her two triple 15.5 cm/60 Type 3: on her centreline before her tower,
    // and abaft her mainmast facing aft.
    sec: { nodes: [46, 48], boxes: [
      { x: [-5, 5], y: [14.5, 20.6], z: [9.4, 24.3] },
      { x: [-5, 5], y: [13.3, 19.6], z: [-58.2, -43.3] },
    ], gun: { guns: 3, minLen: 3, tris: 2400, barrelTris: 600, rests: [0, Math.PI], test: (p) => p.pz1 - p.pz0 > 3 && p.px1 - p.px0 < 1.0 && p.py1 - p.py0 < 1.0 } },
    // And her three triple 46 cm/45 Type 94: No.1 on her forecastle, No.2
    // superfiring over it, No.3 on her quarterdeck facing aft. The lower of
    // the pair forward is cut first, so the platform on its roof goes with it.
    main: { nodes: [100, 102, 104], boxes: [
      { x: [-8.5, 8.5], y: [7.0, 12.6], z: [41.4, 73.3] },
      { x: [-8.5, 8.5], y: [9.9, 15.6], z: [18.9, 50.7] },
      { x: [-8.5, 8.5], y: [9.0, 14.7], z: [-84.0, -52.2] },
    ], gun: { guns: 3, minLen: 5, tris: 4500, barrelTris: 1200, rests: [0, 0, Math.PI], test: BARREL } },
  },
});
