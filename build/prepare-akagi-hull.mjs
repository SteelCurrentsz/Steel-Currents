// IJN Akagi off the owner's model of her -- "CV IJN Akagi (War Thunder)" by
// KojfDiscord (https://skfb.ly/pGusB), under Creative Commons Attribution
// 4.0, credited on the game's Credits screen -- through build/kriss-hull.mjs:
// her hull, her island to port, her great funnel trunked down her starboard
// side and her galleries as one mesh in the Shokaku's paint; her flight deck
// taken up and its outline kept, along the model's own profile of it -- it
// runs down to her stern over the last hundred metres of her, as hers did --
// for carrier.js to lay her planked runway over with her three lifts cut
// through it; and her guns cut free of her.
//
// Her six 20 cm/50 in their casemates aft are the model's own, cut so that
// their barrels elevate in their ports, and the barrels turned round on a
// lathe in place of the model's boxes (turnBarrels). The model draws her twelve-
// centimetre twins as a box or a shield with two rods in it and her 25 mm as
// a flat triangle, so where each stood is taken off it and the gun put back
// in its place is a better one the fleet already has (see
// build/borrow-guns.mjs): the Suzuya's twin high-angle mounting and her 25 mm
// Type 96 twins, off "Japanese Light Cruiser 7-铃鹿（Suzuka）" by 全斗焕
// (https://skfb.ly/owptP), CC BY 4.0.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-akagi-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { SHOKAKU_PAINTS, shokakuPaint } from './kriss-paints.mjs';
import { borrowGuns, turnBarrels } from './borrow-guns.mjs';

const OUT = 'client/js/render/akagiHull.data.js';
/** A 20 cm casemate gun: its barrel and its breech, out to her side at x. */
const casemate = (side, z) => ({ x: side > 0 ? [9.6, 17.9] : [-17.9, -9.6], y: [5.6, 7.8], z: [z - 0.9, z + 0.9], hullToo: true });
/** A twelve-centimetre twin on its platform, standing at `foot`. */
const ha = (x, z, foot) => ({ x: x > 0 ? [x - 2.0, x + 4.6] : [x - 4.6, x + 3.6], y: [foot - 0.05, foot + 3.0], z: [z - 3.1, z + 3.1], pivot: [x, z], hullToo: true });
/** A 25 mm twin in its tub, standing on the floor at `foot`. */
const aa = (x, z, foot) => ({ x: [x - 1.3, x + 1.3], y: [foot + 0.02, foot + 2.0], z: [z - 0.95, z + 0.95], pivot: [x, z], hullToo: true });

await prepare({
  name: 'Akagi', script: 'build/prepare-akagi-hull.mjs',
  src: 'assets/models/cv_ijn_akagi_war_thunder-maximum-compressed.glb',
  out: OUT,
  credit: '"CV IJN Akagi (War Thunder)" by KojfDiscord (https://skfb.ly/pGusB), CC BY 4.0',
  // 260.67 m over all, 8.71 m draught.
  loa: 260.67, draught: 8.71, bow: '+z', groupDepth: 2,
  paints: SHOKAKU_PAINTS, paint: shokakuPaint, paintLines: [0],
  deckFallback: 10, hullTris: 90000, rigging: { y: 14 },
  // Her island, amidships on her port side; and her flight deck flat from
  // abreast it to her bow, and running down over her last hundred metres to
  // her stern, as the model draws it (measured off its plates).
  carrier: { minY: 10, island: { x0: 11.5, x1: 24, z0: -2, z1: 29, face: 11.8, port: true },
    // Her plates lie a hand out of true across her, so they are
    // found within `tol` of it.
    tol: 0.15,
    profile: [[-127.3, 18.58], [-125.42, 18.62], [-121.78, 19.21], [-115, 19.75], [-105, 20.23], [-91.7, 20.49], [-83.2, 20.54], [-66.85, 20.585], [-33.83, 20.67], [-21.5, 20.84], [-14, 20.93], [-8.8, 21.0], [130, 21.0]] },
  kinds: {
    // Her six 20 cm/50 3rd Year Type, in casemates low on her quarters,
    // three a side: what is left of the ten she was completed with.
    main: { boxes: [
      casemate(1, -70.4), casemate(1, -79.8), casemate(1, -87.05),
      casemate(-1, -70.4), casemate(-1, -79.8), casemate(-1, -87.05),
    ], min: 8, gun: { guns: 1, minLen: 2, tris: 400, barrelTris: 120,
      test: (p) => p.pz1 - p.pz0 > 2.5 && p.px1 - p.px0 < 0.6 && p.py1 - p.py0 < 0.6, face: 0.5 } },
    // Her six 12 cm/45 10th Year Type twins, three a side in sponsons under
    // her deck edge.
    dp: { boxes: [
      ha(-16.3, -47.15, 15.65), ha(-15.8, -18.69, 16.32), ha(-16.1, -4.33, 16.72),
      ha(18.74, -36.67, 16.62), ha(18.74, -20.93, 16.62), ha(18.74, -7.29, 16.62),
    ], min: 10, gun: { whole: true, tris: 300, error: 0.05 } },
    // Her fourteen Type 96 25 mm twins: four a side in tubs along her
    // galleries aft, and three a side forward of her island.
    aa2: { boxes: [
      aa(17.05, -79.6, 18.4), aa(17.05, -72.2, 18.4), aa(17.05, -64.5, 18.4), aa(17.05, -56.6, 18.4),
      aa(-17.05, -79.6, 18.4), aa(-17.05, -72.2, 18.4), aa(-17.05, -64.5, 18.4), aa(-17.05, -56.6, 18.4),
      aa(17.15, 31.0, 19.33), aa(17.15, 36.2, 19.33), aa(17.15, 41.4, 19.33),
      aa(-17.4, 35.1, 19.33), aa(-17.4, 40.3, 19.33), aa(-17.4, 45.5, 19.33),
    ], min: 10, gun: { whole: true, tris: 200, error: 0.05 } },
  },
});
await borrowGuns(OUT, { dp: ['suzuya', 'sec'], aa2: ['suzuya', 'aa2'] });
// And her casemate guns' barrels, which the model draws as boxes, turned
// round: a 20 cm/50's, tapering from her breech ring to her muzzle swell, in
// her grey.
// The model draws her six 20 cm alike but for the two at each end of her
// casemate battery, whose barrels it runs half a metre further out than the
// middle pair's, through the edge of the embrasure: all six as the middle
// pair, the one gun turned once.
await turnBarrels(OUT, 'main', { r0: 0.27, r1: 0.17, rgb: [64, 66, 89], length: 4.79, shared: true });
