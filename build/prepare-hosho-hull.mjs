// IJN Hōshō off the owner's model of her -- "Japanese Aircraft Carrier
// Hōshō" by kriss50 (https://skfb.ly/ptTKX), under Creative Commons
// Attribution 4.0, credited on the game's Credits screen -- through
// build/kriss-hull.mjs: her hull, her galleries and her funnels as one mesh in
// Kure grey; her flight deck taken up and its outline kept, for carrier.js to
// lay her planked runway over with her two lifts cut through it; and her four
// 14 cm/50 and her six twin 25 mm cut free of her, each as the model drew it.
//
// She is flush-decked: no island (hers came off in 1924), her bridge under
// the forward end of her flight deck, and her flight deck carried out over
// her bow and her stern on trusses as it was lengthened in 1944.
//
//   node build/prepare-hosho-hull.mjs
import { prepare } from './kriss-hull.mjs';
import { IJN_PAINTS, ijnPaint, BOOT } from './kriss-paints.mjs';

await prepare({
  name: 'Hosho', script: 'build/prepare-hosho-hull.mjs',
  src: 'assets/models/Hosho.glb',
  out: 'client/js/render/hoshoHull.data.js',
  credit: '"Japanese Aircraft Carrier Hōshō" by kriss50 (https://skfb.ly/ptTKX), CC BY 4.0',
  // Her flight deck, 180.8 m from end to end once it was carried out over her
  // bow and her stern, is the whole of the model's length; 6.17 m draught.
  loa: 180.8, draught: 6.17, bow: '+z',
  // Her crash nets, swung out and down along the edges of her flight deck
  // (the model's piece 30), are rope, not deck.
  paints: IJN_PAINTS, paint: (f) => (f.node === 30 ? 'dark' : ijnPaint(f)), paintLines: [0, BOOT],
  deckFallback: 8,
  hullTris: 60000,
  rigging: { y: 9 },
  // No island: nothing stands on her flight deck. (The box is out of her.)
  carrier: { minY: 8, island: { x0: 900, x1: 901, z0: 900, z1: 901, face: 900 },
    // Flat from 70 m abaft her middle to her bow; over her stern it runs down
    // a long gentle slope and then a steeper one to its end, as the model
    // draws it (measured off its plates along her centreline).
    profile: [[-90, 9.67], [-79, 11.40], [-70, 11.85], [90, 11.85]] },
  kinds: {
    // Her four 14 cm/50 3rd Year Type in their shields, two a side, a pair
    // forward under the fore end of her flight deck and a pair abreast her
    // after lift's well.
    main: { auto: { regions: [{}], nodes: [62, 64, 66, 68], size: [2, 8], minFaces: 3000, gap: 0.02 },
      gun: { guns: 1, minLen: 2, tris: 1800, barrelTris: 300,
        test: (p) => p.pz1 - p.pz0 > 2.5 && p.px1 - p.px0 < 0.6 && p.py1 - p.py0 < 0.6 } },
    // And her six Type 96 25 mm twins in their tubs at the edges of her
    // flight deck: a pair forward, and two pairs aft.
    aa25: { auto: { regions: [{}], nodes: [48, 50, 52, 54, 56, 58], size: [1.5, 3.5], minFaces: 3000, gap: 0.02 },
      gun: { whole: true, tris: 900, error: 0.02 } },
  },
});
