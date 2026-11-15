// IJN Yodo off the owner's model -- "Japanese Light Cruiser X-九头龙（Kuzuryu）"
// by 全斗焕 (https://skfb.ly/owptS), under Creative Commons Attribution 4.0,
// credited on the game's Credits screen -- through build/textured-hull.mjs:
// her hull, her bridge, her funnels, her masts and every fitting on her as
// one painted mesh, and every mounting of hers that trains -- her four triple
// 150 mm turrets, her six twin 127 mm, her 40 mm twins and her 25 mm -- cut
// free of her, each as the model drew it; and her four screws. (Her four
// quadruple banks of 610 mm tubes stay with her hull, as the model stows
// them.)
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-yodo-hull.mjs [model.glb]
import { prepare } from './textured-hull.mjs';

/** A slim piece of a 25 mm out past its mounting's face: its barrel. */
const barrel = (p) => p.px1 - p.px0 < 0.16 && p.pz1 > p.face + 0.1 && p.py1 - p.py0 < 0.7;

await prepare({
  // Her paint is weathered -- rust run down her sides, grime along her bulge
  // -- finer than her faces: every face whose corners differ by more than
  // this is halved, so the stains come out the shapes they are painted rather
  // than smeared into triangles.
  contrast: 0.08,
  name: 'Yodo', script: 'build/prepare-yodo-hull.mjs', prefix: 'YODO',
  src: 'assets/models/japanese_light_cruiser_x-kuzuryu-maximum-compressed.glb',
  out: 'client/js/render/yodoHull.data.js',
  credit: '"Japanese Light Cruiser X-九头龙（Kuzuryu）" by 全斗焕 (https://skfb.ly/owptS), CC BY 4.0',
  // 221 m over all: the length at which the model's cutters and motor boats
  // come out, between them, at their own sizes.
  loa: 221,
  shell: /jsc034_zao_1944_844_0/,
  painted: /jsc034_zao_1944_844_0/,
  drop: /c001_net_alpha|c005_grid_2_alpha|c010_grid_8_alpha/i,
  deepY: -4,
  bootTop: +(process.env.BOOT ?? 0.1),
  // (Her banks of tubes stay with her hull. The model draws them stowed fore
  // and aft in torpedo rooms under her upper deck, seen through openings in
  // her side that leave each bank a hand's breadth to spare at its ends --
  // not room to train a degree or two -- and her fish go out of her under
  // the water there: see ships.js.)
  kinds: {
    // Her four triple turrets: two forward, No.2 superfiring, and two aft,
    // No.3 superfiring over No.4. Gunhouses in one piece, barrels in another:
    // each turret is what stands in its own place.
    main: { house: /203mm55/, fit: /6in47/, boxes: [
      { z: [49.5, 72], y: [3, 9.6] },
      [{ z: [-64, -46], y: [3, 9.7] }, { z: [-46, -30], y: [3, 9.3] }],
    ] },
    // Nos. 2 and 3, the superfiring pair, each with the lattice stay for her
    // aerials standing on its roof, which trains with it.
    main2: { house: /203mm55/, fit: /6in47/, riders: true, boxes: [
      [{ z: [33, 49.5], y: [3, 14] }, { z: [49.5, 56], y: [9.6, 14] }],
      [{ z: [-46, -30], y: [9.3, 14] }, { z: [-52, -46], y: [9.7, 14] }],
    ] },
    // Her six twin 127 mm, three a side abreast her bridge and her funnels.
    sec: { house: /100mm65_type98/, gap: 0.3, count: 6 },
    aa40: { house: /40mm_bofors/, gap: 0.3, min: 300, reach: 1.5, count: 20 },
    aa: { house: /25mm_type96/, gap: 0.3, min: 300, reach: 1.0, count: 20 },
    screw: { house: /propeller/, gap: 0.3, count: 4 },
  },
  upKinds: ['aa40', 'aa'],
  guns: {
    main: { guns: 3, minLen: 2 },
    main2: { guns: 3, minLen: 2 },
    sec: { guns: 2, minLen: 1.0 },
    // Her 40 mm twins are stowed cocked well up behind their shields, the
    // whole of their barrels behind the shields' face: what elevates is the
    // two long, slim barrels, about trunnions at their foot.
    aa40: { guns: 2, minLen: 0.5, baseTrunnion: true,
      test: (p) => p.px1 - p.px0 < 0.3 && Math.hypot(p.py1 - p.py0, p.pz1 - p.pz0) > 1.5,
      fitTest: (p) => p.px1 - p.px0 < 0.3 && Math.hypot(p.py1 - p.py0, p.pz1 - p.pz0) > 1.5 },
    aa: { guns: 1, minLen: 0.5, inside: 0.3, test: barrel, fitTest: barrel },
  },
});
