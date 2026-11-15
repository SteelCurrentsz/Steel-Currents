// IJN Suzuya off the owner's model -- "Japanese Light Cruiser 7-铃鹿（Suzuka）"
// by 全斗焕 (https://skfb.ly/owptP), under Creative Commons Attribution 4.0,
// credited on the game's Credits screen -- through build/textured-hull.mjs:
// her hull, her bridge, her funnel, her masts and every fitting on her as one
// painted mesh, and every mounting of hers that trains -- her four triple
// 155 mm turrets, her four twin 127 mm high-angle mountings, her 25 mm in
// singles, twins and triples -- cut free of her, each as the model drew it;
// and her four screws. (Her four quadruple banks of 610 mm tubes stay with
// her hull, as the model stows them.)
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-suzuya-hull.mjs [model.glb]
import { prepare } from './textured-hull.mjs';

/** A slim piece of a 25 mm out past its mounting's face: its barrel. */
const barrel = (p) => p.px1 - p.px0 < 0.16 && p.pz1 > p.face + 0.1 && p.py1 - p.py0 < 0.7;

await prepare({
  // Her paint is weathered -- rust run down her sides, grime along her bulge
  // -- finer than her faces: every face whose corners differ by more than
  // this is halved, so the stains come out the shapes they are painted rather
  // than smeared into triangles.
  contrast: 0.08,
  name: 'Suzuya', script: 'build/prepare-suzuya-hull.mjs', prefix: 'SUZUYA',
  src: 'assets/models/japanese_light_cruiser_7-suzuka-maximum-compressed.glb',
  out: 'client/js/render/suzuyaHull.data.js',
  credit: '"Japanese Light Cruiser 7-铃鹿（Suzuka）" by 全斗焕 (https://skfb.ly/owptP), CC BY 4.0',
  // 200.6 m over all, the Mogamis' length -- within a metre of the length at
  // which the model's 11 m motor boats and 12 m cutters are their own sizes.
  loa: 200.6,
  // Her hull's shell and her bulges, and the pieces of her painted off her
  // hull's atlas.
  shell: /jsc008_myoko_1945_185_0|jsc032_myoko_1941_bools/,
  painted: /jsc008_myoko_1945_185_0|jsc032_myoko_1941_bools/,
  drop: /c001_net_alpha|c010_grid_8_alpha/i,
  deepY: -4,
  bootTop: +(process.env.BOOT ?? 0.25),
  // (Her banks of tubes stay with her hull. The model draws them stowed fore
  // and aft in torpedo rooms under her upper deck, seen through openings in
  // her side that leave each bank a hand's breadth to spare at its ends --
  // not room to train a degree or two -- and her fish go out of her under
  // the water there: see ships.js.)
  kinds: {
    // Her four triple 155 mm turrets: two forward, No.2 superfiring, and two
    // aft, No.3 superfiring over No.4. The model draws all four as one piece,
    // their barrels lying on the roofs of the turrets before them: each is
    // what stands in its own place, the superfiring turret's barrels over the
    // turret it fires over.
    main: { house: /155mm50_type_91/, boxes: [
      { z: [49.5, 70], y: [3, 9.0] },
      { z: [-70, -50.5], y: [3, 9.0] },
    ] },
    // Nos. 2 and 3, the superfiring pair, each with the lattice stay for her
    // aerials standing on its roof, which trains with it.
    main2: { house: /155mm50_type_91/, riders: true, boxes: [
      [{ z: [35, 49.5], y: [3, 14] }, { z: [49.5, 58], y: [9.0, 14] }],
      [{ z: [-50.5, -35], y: [3, 14] }, { z: [-60, -50.5], y: [9.0, 14] }],
    ] },
    // Her four twin 127 mm/40 Type 89, two a side abreast her funnel.
    sec: { house: /127mm40_type_?89/, gap: 0.3, count: 4 },
    // Her 25 mm Type 96: twins in their shields, triples and singles, each
    // kind its own piece.
    aa2: { house: /jga010_25mm_type96_538/, gap: 0.3, min: 300, reach: 1.0, count: 8 },
    aa3: { house: /jga173_25mm_type96/, gap: 0.3, min: 300, reach: 1.0, count: 4 },
    aa1: { house: /jga010_25mm_type96_510/, gap: 0.3, min: 300, reach: 1.0, count: 26 },
    screw: { house: /propeller/, gap: 0.3, count: 4 },
  },
  upKinds: ['aa3', 'aa2', 'aa1'],
  guns: {
    main: { guns: 3, minLen: 2 },
    main2: { guns: 3, minLen: 2 },
    sec: { guns: 2, minLen: 1.0 },
    // Her 25 mm: each barrel drawn as a run of short pieces end to end -- the
    // barrel, its jacket, its flash hider -- every slim piece of it out past
    // the face is the barrel, and its bore is off all of them.
    aa3: { guns: 3, minLen: 0.5, inside: 0.3, test: barrel, fitTest: barrel },
    aa2: { guns: 2, minLen: 0.5, inside: 0.3, test: barrel, fitTest: barrel },
    aa1: { guns: 1, minLen: 0.5, inside: 0.3, test: barrel, fitTest: barrel },
  },
});
