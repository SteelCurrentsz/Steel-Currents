// HMS Fiji off the owner's model of her -- "HMS Fiji (War Thunder) Line Of
// Contact" by KojfDiscord (https://skfb.ly/pEsIV), under Creative Commons
// Attribution 4.0, credited on the game's Credits screen -- through
// build/kriss-hull.mjs: her hull, her bridge, her two funnels, her masts, her
// catapult and Walrus, her cranes and her boats as one mesh, and every
// mounting of hers that trains cut free of her, each as the model drew it:
// her four triple 6-inch turrets, A and B forward and X and Y aft; her four
// twin 4-inch HA abreast her after funnel; her two eight-barrelled pom-poms
// abreast her bridge; and her two triple banks of 21-inch tubes.
//
// The model is drawn a material to a piece, so every turret of hers is in the
// same few pieces: each mounting is found by where it stands, in those pieces.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-fiji-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { RN_PAINTS, rnPaint, BOOT } from './kriss-paints.mjs';

const TURRETS = [70, 71, 72, 80, 81];
const HA = [21, 22, 23, 24, 25];
const POM = [62, 63, 64, 65, 75, 88, 91];
const TUBES = [83, 84];
const ha = (x, z) => ({ x: [x - 2.2, x + 2.2], y: [7.6, 10.6], z: [z - 2.2, z + 2.2], nodes: HA, hullToo: true });

await prepare({
  name: 'Fiji', script: 'build/prepare-fiji-hull.mjs',
  src: 'assets/models/hms_fiji_war_thunder_line_of_contact-maximum-compressed.glb',
  out: 'client/js/render/fijiHull.data.js',
  credit: '"HMS Fiji (War Thunder) Line Of Contact" by KojfDiscord (https://skfb.ly/pEsIV), CC BY 4.0',
  // 169.3 m over all (555 ft 6 in), 5.0 m draught.
  loa: 169.3, draught: 5.0, bow: '+z', groupDepth: 2,
  paints: RN_PAINTS, paint: rnPaint, paintLines: [0, BOOT],
  deckFallback: 7, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0,
  rigging: { y: 14 },
  kinds: {
    // Her four triple 6-inch Mk XXIII: A on her forecastle and B superfiring
    // over it, trained ahead; X superfiring over Y aft, both trained astern.
    // A and Y are taken first, so B and X keep only what stands over them.
    main: { boxes: [
      { x: [-4.2, 4.2], y: [7.6, 11.15], z: [46.5, 64.0], nodes: TURRETS, hullToo: true },
      { x: [-4.2, 4.2], y: [10.1, 16.0], z: [37.0, 58.0], nodes: TURRETS, hullToo: true },
      { x: [-4.2, 4.2], y: [5.2, 8.6], z: [-68.0, -51.5], nodes: TURRETS, hullToo: true },
      { x: [-4.2, 4.2], y: [7.6, 14.0], z: [-60.0, -42.0], nodes: TURRETS, hullToo: true },
    ], gun: { guns: 3, tris: 3200, barrelTris: 500, rests: [0, 0, Math.PI, Math.PI],
      // Her barrels are drawn short and far apart, so her gunhouse's face is
      // given -- four metres before her trunnions -- and a barrel is any
      // long thin run reaching out past it.
      face: 4.0,
      test: (p) => p.px1 - p.px0 < 0.6 && p.pz1 - p.pz0 > 1.5 && p.py1 - p.py0 < 0.6 && p.pz1 > 5.0 } },
    // Her four twin 4-inch Mk XVI HA on her after shelter deck, two a side.
    dp: { boxes: [ha(6.75, -17.3), ha(-6.75, -17.3), ha(6.1, -30.9), ha(-6.1, -30.9)],
      gun: { whole: true, tris: 1400, error: 0.01 } },
    // Her two eight-barrelled 2-pounders abreast her bridge.
    pom: { boxes: [
      { x: [4.0, 9.0], y: [13.8, 17.6], z: [9.4, 15.0], nodes: POM, hullToo: true },
      { x: [-9.0, -4.0], y: [13.8, 17.6], z: [9.4, 15.0], nodes: POM, hullToo: true },
    ], gun: { whole: true, tris: 2000, error: 0.01 } },
    // Her two triple 21-inch banks on her upper deck, one a side.
    tubes: { boxes: [
      { x: [5.4, 9.2], y: [5.0, 7.6], z: [-27.0, -18.0], nodes: TUBES, hullToo: true },
      { x: [-9.2, -5.4], y: [5.0, 7.6], z: [-27.0, -18.0], nodes: TUBES, hullToo: true },
    ], gun: { tubes: 3, tris: 1400, rest: 'axis' } },
  },
});
