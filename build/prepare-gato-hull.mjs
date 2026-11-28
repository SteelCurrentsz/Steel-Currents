// USS Gato off the owner's model of her -- "Gato Sub" by AcesWild1965
// (https://skfb.ly/6WYUF), under Creative Commons Attribution 4.0, credited on
// the game's Credits screen -- through build/kriss-hull.mjs: her pressure
// hull, her casing and her conning tower as one painted mesh. The model is a
// single piece that draws no deck gun and no screws, so nothing is cut free of
// her: her 5"/25 and her Oerlikons are the fleet's own mountings, stood on her
// deck by gato.js. Her ten tubes, six forward and four aft, are in her hull.
//
//   npm i --no-save meshoptimizer@0.22 sharp     (see build/sculpt-source.mjs)
//   node build/prepare-gato-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { BOOT } from './kriss-paints.mjs';

// Measure 9: the fleet boats' black, their decks a little lighter.
const PAINTS = { light: 0x3a3d40, hull: 0x2a2c2f, deck: 0x45474a, dark: 0x1e2023, boot: 0x16181a, bottom: 0x2b2d2b };
const paint = (f) => {
  if (f.kind === 'screw') return 'dark';
  if (f.kind) return 'light';
  if (f.cy < -0.02) return 'bottom';
  if (f.cy < BOOT) return 'boot';
  if (f.up && f.cy < 2.6) return 'deck';
  return f.cy < 2.0 ? 'hull' : 'light';
};

await prepare({
  name: 'Gato', script: 'build/prepare-gato-hull.mjs',
  src: 'assets/models/gato_sub-maximum-compressed.glb',
  out: 'client/js/render/gatoHull.data.js',
  credit: '"Gato Sub" by AcesWild1965 (https://skfb.ly/6WYUF), CC BY 4.0',
  // 95 m over all (311 ft 9 in), 5.2 m draught surfaced.
  loa: 95, draught: 5.2, bow: '+x', groupDepth: 2,
  paints: PAINTS, paint, paintLines: [0, BOOT, 2.0], deckPaints: ['deck'],
  deckFallback: 2.0, sideIn: 0.4, cutAll: true, hullTris: 30000,
  // Her radio aerial, run from her tower aft to her after casing, drawn joined
  // on to her hull.
  removeFaces: [{ x: [-0.3, 0.3], y: [2.4, 11.5], z: [-21.5, 8.2], minLen: 4 }],
  kinds: {},
});
