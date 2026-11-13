// IJN Musashi off the owner's model of her -- "IJN Musashi (War Thunder)
// Spearhead" by KojfDiscord (https://skfb.ly/pCEY8), under Creative Commons
// Attribution 4.0, credited on the game's Credits screen -- through
// build/kriss-hull.mjs: her hull, her tower, her funnel and her mainmast as one
// painted mesh, and every gun of hers the model draws cut free of her, as she
// was armed when she joined the fleet in 1942: her three triple 46 cm, all four
// triple 15.5 cm -- the wing pair abreast her funnel included -- her six twin
// 12.7 cm in their shields, her twelve triple 25 mm, and her four screws.
//
// The two boats the model has slung outboard on their davits abreast No.2 are
// taken off her, and so is anything the export left adrift (`floaters`).
//
//   node build/prepare-musashi-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { IJN_BB_PAINTS, ijnBBPaint, BOOT } from './kriss-paints.mjs';

const BARREL = (p) => p.pz1 - p.pz0 > 4 && p.px1 - p.px0 < 1.6 && p.py1 - p.py0 < 1.6;
// The model's pieces that draw each kind of gun: a box takes only these.
const MAIN = [18, 32, 33, 34, 35, 66];
const SEC = [19, 23, 24, 25, 26, 27, 28, 42, 74, 75];
const HA = [14, 66, 76, 77, 78, 79];
const AA = [10, 11, 29, 30, 43, 68];
/** A box round a mounting standing at (x, z), `r` metres each way, from y0 to y1. */
const H = Math.PI / 2;
const at = (x, z, y0, y1, r = 1.9) => ({ x: [x - r, x + r], y: [y0, y1], z: [z - r, z + r] });

await prepare({
  name: 'Musashi', script: 'build/prepare-musashi-hull.mjs',
  src: 'assets/models/ijn_musashi_war_thunder_spearhead-maximum-compressed.glb',
  out: 'client/js/render/musashiHull.data.js',
  credit: '"IJN Musashi (War Thunder) Spearhead" by KojfDiscord (https://skfb.ly/pCEY8), CC BY 4.0',
  loa: 263.0, draught: 10.4, bow: '+z',
  hull: [48, 58, 59, 60, 64, 70],
  // Her teak: the model lays it as its own planking (its material 5) over her
  // forecastle and her midships deck to No.3; the rest of her is steel.
  paints: IJN_BB_PAINTS, paint: (f) => (f.mat === 5 && f.up && !f.kind ? 'wood' : ijnBBPaint(f)),
  paintLines: [0, BOOT], deckPaints: ['wood'],
  deckFallback: 8.5, hullTris: 90000,
  floaters: {},
  // Her railings, nets and aerial wires, drawn by the model as cut-out cards,
  // and her bridge glass and her ensign: kept with their pictures.
  cards: { nodes: [5, 8, 13, 15, 17, 19, 44] },
  // Her boats on their davits, slung outboard abreast No.2, either side.
  remove: [
    { x: [17.6, 23.0], y: [7.0, 13.5], z: [14.0, 24.6], nodes: [19, 41, 65, 67, 69] },
    { x: [-23.0, -17.6], y: [7.0, 13.5], z: [14.0, 24.6], nodes: [19, 41, 65, 67, 69] },
  ],
  kinds: {
    // Her six twin 12.7 cm/40 Type 89 in their shields, three a side abreast
    // her funnel, the middle pair a deck higher, trained out on the beam.
    ha: { nodes: HA, boxes: [
      { x: [3.2, 10.8], y: [11.6, 16.2], z: [-13.9, -7.0] },
      { x: [-10.8, -3.2], y: [11.6, 16.2], z: [-13.9, -7.0] },
      { x: [3.2, 10.8], y: [14.1, 18.6], z: [-25.0, -18.0] },
      { x: [-10.8, -3.2], y: [14.1, 18.6], z: [-25.0, -18.0] },
      { x: [3.2, 10.8], y: [11.6, 16.2], z: [-33.2, -26.2] },
      { x: [-10.8, -3.2], y: [11.6, 16.2], z: [-33.2, -26.2] },
    ], gun: { whole: true, tris: 1600, error: 0.02, rests: [H, -H, H, -H, H, -H] } },
    // Her twelve triple 25 mm Type 96: four in their tubs about her tower,
    // two a side on her deck abreast her funnel, and four abaft it, the after
    // pair trained fore and aft.
    aa: { nodes: AA, boxes: [
      at(5.43, 4.05, 13.3, 16.0), at(-5.43, 4.05, 13.3, 16.0),
      at(7.78, 0.8, 12.9, 15.5), at(-7.78, 0.8, 12.9, 15.5),
      at(12.04, -5.82, 8.3, 11.0), at(-12.04, -5.82, 8.3, 11.0),
      at(13.56, -28.68, 8.3, 11.0), at(-13.56, -28.68, 8.3, 11.0),
      at(4.74, -32.1, 17.3, 20.5), at(-4.74, -32.1, 17.3, 20.5),
      at(2.19, -40.98, 17.3, 20.5, 1.5), at(-2.19, -40.98, 17.3, 20.5, 1.5),
    ], gun: { whole: true, tris: 700, error: 0.03, rests: [H, -H, H, -H, H, -H, H, -H, H, -H, 0, 0] } },
    // Her four four-bladed screws, the inner pair aft of the outer.
    screw: { boxes: [
      { x: [0.9, 6.3], y: [-10.4, -5.2], z: [-109.8, -105.9] },
      { x: [-6.3, -0.9], y: [-10.4, -5.2], z: [-109.8, -105.9] },
      { x: [7.8, 13.0], y: [-10.0, -4.9], z: [-98.1, -94.3] },
      { x: [-13.0, -7.8], y: [-10.0, -4.9], z: [-98.1, -94.3] },
    ], min: 20, hullToo: true, nodes: [70] },
    // Her four triple 15.5 cm/60 Type 3: on her centreline before her tower
    // and abaft her mainmast facing aft, and one either side abreast her
    // funnel, trained forward.
    sec: { nodes: SEC, boxes: [
      { x: [-5, 5], y: [14.7, 22.2], z: [9.5, 25.0] },
      { x: [-5, 5], y: [13.3, 21.0], z: [-56.0, -40.8] },
      { x: [7.2, 17.0], y: [9.0, 13.9], z: [-23.3, -8.5] },
      { x: [-17.0, -7.2], y: [9.0, 13.9], z: [-23.3, -8.5] },
    ], gun: { guns: 3, minLen: 3, tris: 3000, barrelTris: 800, rests: [0, Math.PI, 0, 0], test: (p) => p.pz1 - p.pz0 > 2.5 && p.px1 - p.px0 < 1.0 && p.py1 - p.py0 < 1.0 } },
    // And her three triple 46 cm/45 Type 94: No.1 on her forecastle, No.2
    // superfiring over it, No.3 on her quarterdeck facing aft.
    main: { nodes: MAIN, boxes: [
      { x: [-9, 9], y: [7.3, 12.9], z: [42.0, 73.4] },
      { x: [-9, 9], y: [10.4, 16.1], z: [19.8, 51.3] },
      { x: [-9, 9], y: [8.6, 14.3], z: [-81.6, -50.0] },
    ], gun: { guns: 3, minLen: 5, tris: 5000, barrelTris: 1200, rests: [0, 0, Math.PI], test: BARREL } },
  },
});
