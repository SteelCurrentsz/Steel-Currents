// RN Roma off the owner's model of her -- "RN Roma (War Thunder) Leviathans"
// by KojfDiscord (https://skfb.ly/pyzRx), under Creative Commons Attribution
// 4.0, credited on the game's Credits screen -- through build/kriss-hull.mjs:
// her hull, her tower, her two funnels, her masts and her catapult as one
// mesh, and every mounting of hers that trains cut free of her, each as the
// model drew it: her three triple 381 mm/50, two forward and one aft; her
// four triple 152 mm/55 at the corners of her superstructure; her twelve
// 90 mm/50 in their stabilised turrets, six a side; her twin 37 mm/54; and
// her screws.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-roma-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { RM_PAINTS, rmPaint, BOOT } from './kriss-paints.mjs';

/** A 90 mm turret whose shield stands at (x, z). */
const ninety = (x, z) => ({ x: [x - 2.4, x + 2.4], y: [9.6, 13.6], z: [z - 2.6, z + 2.0], hullToo: true });
const S152 = (x, z0, z1) => ({ x: x > 0 ? [x - 3.6, x + 3.6] : [x - 3.6, x + 3.6], y: [7.4, 12.2], z: [z0, z1], hullToo: true });

await prepare({
  name: 'Roma', script: 'build/prepare-roma-hull.mjs',
  src: 'assets/models/rn_roma_war_thunder_leviathans-maximum-compressed.glb',
  out: 'client/js/render/romaHull.data.js',
  credit: '"RN Roma (War Thunder) Leviathans" by KojfDiscord (https://skfb.ly/pyzRx), CC BY 4.0',
  // 240.7 m over all, 9.6 m deep load draught.
  loa: 240.7, draught: 9.6, bow: '+z', groupDepth: 2,
  paints: RM_PAINTS, paint: (f) => (f.up && !f.kind && f.cy > 2 && f.cy < 12 && Math.abs(f.ny) > 0.97 ? 'deck' : rmPaint(f)), paintLines: [0, BOOT],
  deckFallback: 8, decimate: true, hullTris: 60000, hullError: 0.004, amax: 2.0,
  rigging: { y: 16 },
  kinds: {
    // Her three triple 381 mm/50 Model 1934: No.1 on her forecastle, No.2
    // superfiring over it, both trained ahead, and No.3 aft, trained astern.
    main: { boxes: [
      { x: [-7.5, 7.5], y: [8.0, 13.2], z: [38.0, 72.0] },
      { x: [-7.5, 7.5], y: [9.6, 17.6], z: [18.0, 50.0] },
      { x: [-7.5, 7.5], y: [8.4, 14.2], z: [-82.0, -46.5] },
    ], hullToo: true, gun: { guns: 3, minLen: 2, tris: 4000, barrelTris: 600, rests: [0, 0, Math.PI] } },
    // Her four triple 152 mm/55 Model 1934/35: a pair abreast No.2, trained
    // ahead, and a pair abaft her mainmast, trained astern.
    sec: { boxes: [S152(9.8, 14.0, 26.6), S152(-9.8, 14.0, 26.6), S152(9.9, -52.0, -39.0), S152(-9.9, -52.0, -39.0)],
      gun: { whole: true, tris: 2400, error: 0.01, rests: [0, 0, Math.PI, Math.PI] } },
    // Her twelve 90 mm/50 Model 1939 in their single stabilised turrets, six
    // a side along her superstructure.
    dp: { boxes: [12.9, 7.5, 2.1, -4.4, -10.8, -17.3].flatMap((z) => [
      ninety(z > 5 || z < -15 ? 9.7 : 11.3, z), ninety(z > 5 || z < -15 ? -9.7 : -11.3, z)]),
      gun: { whole: true, tris: 1500, error: 0.01 } },
    // Her 37 mm/54 Breda twins about her superstructure.
    aa2: { auto: { regions: [{}], nodes: [67, 68, 69, 70, 71, 72, 73, 74, 75, 76], size: [1.5, 3.6], minFaces: 900, gap: 0.1 },
      gun: { whole: true, tris: 900, error: 0.01 } },
  },
});
