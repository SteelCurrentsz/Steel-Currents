// USS Louisiana off the owner's model of her -- "US Battleship Louisiana" by
// 全斗焕 (https://skfb.ly/o6Ant), under Creative Commons Attribution 4.0,
// credited on the game's Credits screen -- through build/textured-hull.mjs:
// her hull, her superstructure, her funnels, her masts and every fitting on
// her as one painted mesh, and every mounting of hers that trains -- her
// 16-inch turrets, her 5-inch/54 twins, her 76 mm twins and her 20 mm --
// cut free of her, each as the model drew it; and her screws.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-louisiana-hull.mjs [model.glb]
import { prepare } from './textured-hull.mjs';

await prepare({
  name: 'Louisiana', script: 'build/prepare-louisiana-hull.mjs', prefix: 'LOUISIANA',
  src: 'assets/models/us_battleship_louisiana-maximum-compressed.glb',
  out: 'client/js/render/louisianaHull.data.js',
  credit: '"US Battleship Louisiana" by 全斗焕 (https://skfb.ly/o6Ant), CC BY 4.0',
  // The model's 188 units stem to stern brought up to 281 m over all -- a
  // Montana's length, and her beam comes out a Montana's too, 36.9 m -- with
  // its waterline where the model has it, at y = 0, which puts her keel
  // 10.9 m under it.
  loa: 281,
  shell: /asb040_ohio_1945_hull_98_0/,
  painted: /asb040_ohio_1945_(hull|deckhouse)_\d/,
  // The grating and the netting drawn as single sheets with a see-through
  // texture over them, which the fleet's plating would draw as blocks of black.
  drop: /_alpha|floater_net_basket_grid/i,
  deepY: -5,
  // Where her dazzle ends and her boot-topping begins.
  bootTop: +(process.env.BOOT ?? 0.6),
  // Her guns' paint cut finer, and their atlases read whole and sharp: the
  // black bands round her barrels and her muzzles come out edges, not smears.
  finePaint: /agm182|16in50|ags145|3in50|Chikugo|Material #476/,
  crisp: /agm182|16in50|ags145/,
  kinds: {
    // Her four twin 16-inch turrets: A and B forward, B superfiring; X
    // superfiring over Y aft. The model draws their gunhouses in one piece and
    // their barrels in another.
    // The roof periscopes, the life rafts and their net baskets hung on the
    // gunhouses' flanks go round with them; each turret is seated off its
    // gunhouse alone, which the rafts hang lower than, and trains about the
    // middle of its barbette's ring, not of ring and skirt together.
    main: { house: /agm182_18in48_mk1_twin/, fit: /16in50_mk7|am133_boat_7_543|am777_periscope_717|am073_floater_net_basket_545/,
      gap: 0, min: 300, reach: 3, count: 4, seatHouse: true, ring: true },
    // Her ten 5-inch/54 twins, five a side.
    sec: { house: /ags145_5in54/, gap: 0.3, min: 150, reach: 1.5, count: 10 },
    // Her eighteen 3-inch/50 twins in their enclosed gunhouses -- her 76 mm --
    // drawn out of several pieces of the model each.
    dp: { house: /Chikugo-class_material|Material #476|3in50_twin_mark_33/, gap: 0.3, min: 300, reach: 1.2, count: 18 },
    // Her forty 20 mm Oerlikons.
    aa: { house: /20mm_oerlikon/, gap: 0.2, min: 100, reach: 0.8, count: 40 },
    screw: { house: /propeller/, gap: 0.3, count: 4 },
  },
  guns: {
    main: { guns: 2, minLen: 2 },
    sec: { guns: 2, minLen: 1.0 },
    dp: { guns: 2, minLen: 0.8 },
    // An Oerlikon trains whole on its pedestal.
    aa: { whole: true },
  },
});
