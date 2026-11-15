// IJN Mogami off the owner's model -- "Japanese Light Cruiser 9-大井（Ooi）" by
// 全斗焕 (https://skfb.ly/owptR), under Creative Commons Attribution 4.0,
// credited on the game's Credits screen -- through build/textured-hull.mjs:
// her hull, her bridge, her funnel, her masts and every fitting on her as one
// painted mesh, and every mounting of hers that trains -- her five twin
// 203 mm turrets, her four twin 100 mm, her 40 mm twins and her 25 mm -- cut
// free of her, each as the model drew it; and her four screws. (Her four
// quadruple banks of 610 mm tubes stay with her hull, as the model stows
// them.)
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-mogami-hull.mjs [model.glb]
import { prepare } from './textured-hull.mjs';

/** A slim piece of a 25 mm out past its mounting's face: its barrel. */
const barrel = (p) => p.px1 - p.px0 < 0.16 && p.pz1 > p.face + 0.1 && p.py1 - p.py0 < 0.7;

await prepare({
  // Her paint is weathered -- rust run down her sides, grime along her bulge
  // -- finer than her faces: every face whose corners differ by more than
  // this is halved, so the stains come out the shapes they are painted rather
  // than smeared into triangles.
  contrast: 0.08,
  name: 'Mogami', script: 'build/prepare-mogami-hull.mjs', prefix: 'MOGAMI',
  src: 'assets/models/japanese_light_cruiser_9-ooi-maximum-compressed.glb',
  out: 'client/js/render/mogamiHull.data.js',
  credit: '"Japanese Light Cruiser 9-大井（Ooi）" by 全斗焕 (https://skfb.ly/owptR), CC BY 4.0',
  // Her own 200.6 m over all.
  loa: 200.6,
  shell: /jsc012_ibuki_1944_hull_947_0|jsc012_ibuki_1944_bulges/,
  painted: /jsc012_ibuki_1944_hull_947_0|jsc012_ibuki_1944_bulges/,
  drop: /c001_net_alpha|c010_grid_8_alpha/i,
  deepY: -4,
  bootTop: +(process.env.BOOT ?? 0.2),
  // (Her banks of tubes stay with her hull. The model draws them stowed fore
  // and aft in torpedo rooms under her upper deck, seen through openings in
  // her side that leave each bank a hand's breadth to spare at its ends --
  // not room to train a degree or two -- and her fish go out of her under
  // the water there: see ships.js.)
  kinds: {
    // Her five twin 203 mm turrets: Nos. 1 and 2 forward and No.3
    // superfiring over them, No.4 superfiring over No.5 aft. Gunhouses in one
    // piece, barrels in another: each turret is what stands in its own place.
    main: { house: /203mm50_type_e/, fit: /6in47/, boxes: [
      { z: [59.5, 78], y: [3, 9.0] },
      [{ z: [51, 59.5], y: [3, 9.0] }, { z: [44.5, 51], y: [3, 8.5] }],
      { z: [-72, -54], y: [3, 8.75] },
    ] },
    // Nos. 3 and 4, the superfiring pair, each with the lattice stay for her
    // aerials standing on its roof, which trains with it.
    main2: { house: /203mm50_type_e/, fit: /6in47/, riders: true, boxes: [
      [{ z: [33, 44.5], y: [3, 14] }, { z: [44.5, 54], y: [8.5, 14] }],
      [{ z: [-54, -42], y: [3, 14] }, { z: [-62, -54], y: [8.75, 14] }],
    ] },
    // Her four twin 100 mm/65 Type 98, two a side abreast her funnel.
    sec: { house: /100mm65_type98/, gap: 0.3, count: 4 },
    // Her twin 40 mm and her single 25 mm Type 96.
    aa40: { house: /40mm_bofors/, gap: 0.3, min: 300, reach: 1.5, count: 10 },
    aa: { house: /25mm_type96/, gap: 0.3, min: 300, reach: 1.0, count: 28 },
    screw: { house: /propeller/, gap: 0.3, count: 4 },
  },
  upKinds: ['aa40', 'aa'],
  guns: {
    main: { guns: 2, minLen: 2 },
    main2: { guns: 2, minLen: 2 },
    // Her 100 mm twins' barrels are bare tubes, a ring of points at each end:
    // their bores off the whole of them.
    sec: { guns: 2, minLen: 1.0, fitTest: (p) => p.pz1 > p.face + 0.5 },
    // Her 40 mm twins are stowed cocked well up behind their shields, the
    // whole of their barrels behind the shields' face: what elevates is the
    // two long, slim barrels, about trunnions at their foot.
    aa40: { guns: 2, minLen: 0.5, baseTrunnion: true,
      test: (p) => p.px1 - p.px0 < 0.3 && Math.hypot(p.py1 - p.py0, p.pz1 - p.pz0) > 1.5,
      fitTest: (p) => p.px1 - p.px0 < 0.3 && Math.hypot(p.py1 - p.py0, p.pz1 - p.pz0) > 1.5 },
    aa: { guns: 1, minLen: 0.5, inside: 0.3, test: barrel, fitTest: barrel },
  },
});
