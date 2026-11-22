// RN Andrea Doria off the owner's model of her -- "Andrea Doria (World of
// Warships)" by KojfDiscord (https://skfb.ly/pzSsC), under Creative Commons
// Attribution 4.0, credited on the game's Credits screen -- through
// build/kriss-hull.mjs: her hull, her new tower, her two funnels and her masts
// as one mesh, and every mounting of hers that trains cut free of her, each
// as the model drew it: her ten 320 mm/44, a triple turret and a superfiring
// twin forward and the same aft; her four triple 135 mm/45 grouped about her
// tower; and her ten 90 mm/50, five a side.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-doria-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { RM_PAINTS, rmPaint, BOOT } from './kriss-paints.mjs';


await prepare({
  name: 'Andrea Doria', script: 'build/prepare-doria-hull.mjs',
  src: 'assets/models/andrea_doria_world_of_warships-maximum-compressed.glb',
  out: 'client/js/render/doriaHull.data.js',
  credit: '"Andrea Doria (World of Warships)" by KojfDiscord (https://skfb.ly/pzSsC), CC BY 4.0',
  // 186.9 m over all after her rebuilding, 8.6 m deep.
  loa: 186.9, draught: 8.6, bow: '+z', groupDepth: 2,
  paints: RM_PAINTS, paint: (f) => (f.up && !f.kind && f.cy > 2 && f.cy < 12 && Math.abs(f.ny) > 0.97 ? 'deck' : rmPaint(f)), paintLines: [0, BOOT],
  deckFallback: 7, hullTris: 90000,
  rigging: { y: 16 },
  kinds: {
    // Her 320 mm/44: the triple No.1 on her forecastle with the twin No.2
    // superfiring over it, trained ahead; the twin No.3 superfiring over the
    // triple No.4 aft, trained astern.
    main: { boxes: [
      { x: [-6.5, 6.5], y: [7.0, 11.2], z: [33.0, 58.0] },
      { x: [-6.5, 6.5], y: [9.8, 15.8], z: [18.5, 44.0] },
      { x: [-6.5, 6.5], y: [9.2, 14.2], z: [-62.0, -38.6] },
      { x: [-6.5, 6.5], y: [6.0, 10.4], z: [-78.0, -47.0] },
    ], hullToo: true, gun: { whole: true, tris: 4000, error: 0.005, rests: [0, 0, Math.PI, Math.PI] } },
    // Her four triple 135 mm/45 Model 1938, two a side about her tower.
    // Her four triple 135 mm/45 Model 1938, two a side forward of her tower,
    // the after one of each pair superfiring, all trained ahead.
    sec: { boxes: [
      { x: [3.5, 12.0], y: [7.8, 10.8], z: [15.5, 27.0], nodes: [89, 90] },
      { x: [-12.0, -3.5], y: [7.8, 10.8], z: [15.5, 27.0], nodes: [89, 90] },
      { x: [4.5, 12.5], y: [9.9, 12.6], z: [7.0, 19.0], nodes: [89, 90] },
      { x: [-12.5, -4.5], y: [9.9, 12.6], z: [7.0, 19.0], nodes: [89, 90] },
    ], gun: { whole: true, tris: 2000, error: 0.01, rests: [0, 0, 0, 0] } },
    // Her ten 90 mm/50 Model 1939 in their stabilised turrets, five a side
    // along her superstructure abreast her funnels.
    dp: { boxes: [-23.84, -18.05, -12.25, -6.46, -0.67].flatMap((z) => [
      { x: [7.4, 13.4], y: [7.9, 11.6], z: [z - 2.9, z + 2.9], hullToo: true },
      { x: [-13.4, -7.4], y: [7.9, 11.6], z: [z - 2.9, z + 2.9], hullToo: true }]),
      gun: { whole: true, tris: 1500, error: 0.01 } },
  },
});
