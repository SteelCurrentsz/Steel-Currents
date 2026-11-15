// RN Cesare Borgia off the owner's model of her -- "Italian Light Cruiser
// Cesare Borgia(Plan B) -T10" by 全斗焕 (https://skfb.ly/prA87), under Creative
// Commons Attribution 4.0, credited on the game's Credits screen -- through
// build/textured-hull.mjs: her hull, her superstructure, her funnels, her
// masts and every fitting on her as one painted mesh, and every mounting of
// hers that trains -- her four triple 152 mm turrets, her twenty 75 mm
// dual-purpose guns (twelve in round shields, eight in open-backed ones), her
// fourteen 37 mm Breda twins and her two quadruple banks of 533 mm tubes --
// cut free of her, each as the model drew it; and her four screws.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-borgia-hull.mjs [model.glb]
import { prepare } from './textured-hull.mjs';

await prepare({
  name: 'Borgia', script: 'build/prepare-borgia-hull.mjs', prefix: 'BORGIA',
  src: 'assets/models/italian_light_cruiser_cesare_borgiaplan_b_t10-maximum-compressed.glb',
  out: 'client/js/render/borgiaHull.data.js',
  credit: '"Italian Light Cruiser Cesare Borgia(Plan B) -T10" by 全斗焕 (https://skfb.ly/prA87), CC BY 4.0',
  // 3.9 of the model's units stem to stern and 0.41 across, brought up to
  // 229 m: the length at which the boats the model carries are their own
  // sizes -- its 10 m motor boats, its 13 m launches and its 8.6 m whalers
  // each come out within a hand's breadth of what they are named -- which
  // makes her 24.3 m across, her keel 6.6 m under her waterline.
  loa: 229,
  // Her hull's shell, and the pieces of her painted off her hull's atlas.
  shell: /isc015_torino_1943_hull_168/,
  painted: /isc015_torino_1943_(hull|deckhouse)_\d/,
  // The grating and the netting drawn as single sheets with a see-through
  // texture over them, which the fleet's plating would draw as blocks of black.
  drop: /c010_grid_8_alpha|c001_net_alpha/i,
  // Where her grey ends and her boot-topping begins, painted on the atlas as a
  // line along her side 0.6 m over her waterline.
  bootTop: 0.6,
  hm: { x0: -13, z0: -116, step: 0.5, nx: 53, nz: 465 },
  lines: { z0: -115, dz: 1, nz: 231, y0: -7.5, dy: 0.5, ny: 46 },
  kinds: {
    // Her four triple 152 mm turrets: A and B forward, B superfiring; X
    // superfiring over Y aft. The model draws each gunhouse, its barrels and
    // its sights as runs of the one piece, and the rangefinder on its roof as
    // a piece of its own.
    main: { house: /igs014_152mm55_barrels_3/, gap: 0, min: 400, reach: 1.2, fit: /im405_rm2_galileo/, count: 4 },
    // Her twelve 75 mm in their round shields, six a side down her upper deck
    // abreast her bridge and her funnels.
    dp: { house: /igs017_90mm50_barrels_1/, gap: 0.6, min: 150, reach: 1.2, count: 12 },
    // And her eight 75 mm in open-backed shields on their pedestals: a pair
    // abreast her bridge, a pair abreast her mainmast, and two pairs aft.
    dp2: { house: /iga027_65mm_64_ansaldo/, gap: 0.3, min: 300, reach: 1.2, count: 8 },
    // Her 37 mm Breda twins, on her forecastle, about her superstructure and
    // on her quarterdeck.
    aa: { house: /iga004_breda_37mm_double/, gap: 0.3, min: 150, reach: 1.2, count: 14 },
    // Her two quadruple banks of 533 mm tubes, one a side abreast her mainmast.
    tubes: { house: /igt033_533mm_4_tubes/, gap: 0.6, count: 2 },
    // Her four screws.
    screw: { house: /propeller/, gap: 0.3, count: 4 },
  },
  // Her Bredas are stowed cocked well up, their breeches and loading
  // platforms reaching out further from the pivot than their muzzles: they
  // face their highest points instead, which are their muzzles.
  upKinds: ['aa'],
  guns: {
    // Her 152 mm triples: three barrels out of a gunhouse.
    main: { guns: 3, minLen: 2 },
    // Her 75 mm singles: one barrel out of a round shield.
    dp: { guns: 1, minLen: 1.0 },
    // Her 75 mm on their pedestals: one barrel out of an open-backed shield,
    // the gun's body behind it elevating with it, its bore off its barrel
    // alone -- a bare tube, a ring of points at each end.
    dp2: { guns: 1, minLen: 0.8, inside: 1.0,
      test: (p) => p.px1 - p.px0 < 0.7 && p.pz1 > 1.3 && p.py1 > 2.0,
      fitTest: (p) => p.px1 - p.px0 < 0.3 && p.pz1 > p.face + 0.5 },
    // Her 37 mm Breda twins: what elevates is each gun's barrel and the
    // receiver behind it, about the trunnions at the receivers' fronts; its
    // bore is off the barrels alone, out past its face.
    aa: { guns: 2, minLen: 0.5, inside: 0.95,
      test: (p) => p.px1 - p.px0 < 0.25 && p.pz1 - p.pz0 > 0.8 && p.py1 - p.py0 > 0.4 && p.pz1 > -0.1,
      fitTest: (p) => p.pz1 > p.face },
  },
  // Her datasheet trains each bank from fore and aft out to 0.74 rad abaft
  // her beam: 132 degrees.
  tubeSwing: 133,
});
