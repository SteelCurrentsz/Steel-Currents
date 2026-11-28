// Where each ship's catapult stands on her own model, for the ships whose
// models drew one -- with its scout sat on it, or bare -- and nothing that
// worked it (see seaplaneFit.js for what each figure means).
//
// Every one of these was found by looking at her: a top view and a side view
// of her waist and her quarterdeck on a metre grid, and a height map of the
// model over it, the girder and the scout on it measured off them. A ship
// whose model has no catapult on it is not here, however many aircraft she
// carried in life.

const PI = Math.PI;

export const SEAPLANE_FITS = {
  // ---------------------------------------------------- the Royal Navy ----
  // The fixed cross-deck D-type abaft her after funnel, with a Walrus on it.
  repulse: {
    aero: 'walrus', cross: true, at: [0, 7.9, -29.5], front: 8.5, draw: false,
    cut: [[-7.5, 7.5, 8.3, 14, -37, -21]],
  },
  // Her cross-deck catapult between the hangars and her funnel, the same.
  warspite: {
    aero: 'walrus', cross: true, at: [0, 7.4, -21.5], front: 8.5, draw: false,
    cut: [[-7.5, 7.5, 7.8, 13.5, -29, -14]],
  },
  // A Leander: the girder on its turntable on her centreline between her
  // funnel and her mainmast, under the crane.
  ajax: {
    aero: 'walrus', at: [0, 10.5, -19], base: 0, back: -1.5, front: 17, out: 1.2,
    cut: [[-1.4, 1.4, 9.4, 11.4, -21.5, -0.5]],
  },

  // ---------------------------------------------------- the US Navy ----
  // A Cleveland's quarterdeck: two catapults on their turntables either side
  // of the crane, stowed pointing forward and trained out over her quarters.
  fargo: {
    aero: 'kingfisher', pair: true, at: [5.8, 7.4, -86.5], a: 8,
    base: 0, rest: 0.1, out: 1.16, back: -3, front: 20,
    cut: [[3.6, 9, 6.3, 13, -90, -62], [-9, -3.6, 6.3, 13, -90, -62]],
  },
  wichita: {
    aero: 'kingfisher', pair: true, at: [5.6, 8.6, -86], a: 6,
    base: 0, rest: 0.1, out: 1.16, back: -3, front: 18,
  },
  // Her two on the fantail, lying forward and a little outboard, and trained
  // out abeam.
  louisiana: {
    aero: 'kingfisher', pair: true, at: [5.6, 7.3, -133.5], a: 4,
    base: 0.23, out: 1.3, back: -2, front: 17,
    cut: [[4.8, 10.5, 6.4, 9.5, -134, -124], [7.2, 10.5, 6.4, 9.5, -124, -115],
      [-10.5, -4.8, 6.4, 9.5, -134, -124], [-10.5, -7.2, 6.4, 9.5, -124, -115]],
  },
  // Her two on the fantail with a Kingfisher on each, and two more on deck.
  northcarolina: {
    aero: 'kingfisher', pair: true, at: [8.8, 6.3, -93], a: 1.5,
    base: 0, rest: 0.1, out: 1.0, back: -3, front: 19,
    cut: [[2.5, 10, 5.4, 12, -103, -72], [-10, -2.5, 5.4, 12, -103, -72], [-6, 6, 5.4, 12, -95, -80]],
  },
  // One on her fantail: her plane on it, her two cranes either side.
  tennessee: {
    aero: 'kingfisher', at: [0, 6.9, -84], base: PI, back: -9, front: 11, out: 1.2,
    cut: [[-1.6, 1.6, 5.8, 9.5, -96, -72], [-4.5, 4.5, 6.6, 9.5, -88, -79]],
  },
  // Her pair amidships, out by her sides.
  alaska: {
    aero: 'kingfisher', pair: true, at: [10.2, 10.4, -6], base: 0, back: -2, front: 15, out: 0.9,
    cut: [[8.8, 12, 9.0, 13, -10, 10], [-12, -8.8, 9.0, 13, -10, 10]],
  },
  // On the roof of her hangar between her funnels, trained out to starboard.
  indianapolis: {
    aero: 'kingfisher', at: [-1, 13.2, -9.5], base: -0.435, sgn: -1, back: -2.5, front: 15, out: 0.8,
    cut: [[-8.5, 0.5, 12.0, 15, -10, 6]],
  },
  // Her pair amidships, trained out over either beam.
  pensacola: {
    aero: 'kingfisher', cross: true, at: [0, 12.0, 4], front: 12.5,
    cut: [[2, 13.5, 8.5, 13.5, -2.5, 9.5], [-13.5, -2, 8.5, 13.5, -2.5, 9.5]],
  },
  // The one the model drew, trained out to starboard over her waist.
  neworleans: {
    aero: 'kingfisher', at: [-0.8, 12.2, -20.5], base: -PI / 2, sgn: -1, back: -2, front: 12,
    cut: [[-12.5, -0.8, 11.0, 16, -27, -14]],
  },

  // ---------------------------------------------- the Imperial Navy ----
  // Her girder on her centreline abaft her funnel, the two Jakes on it.
  agano: {
    aero: 'jake', at: [0, 10.0, -30], base: 0, back: -10, front: 11, out: 1.3,
    cut: [[-7.5, 7.5, 10.4, 15.5, -41, -12.5], [-1.6, 1.6, 8.9, 10.4, -41, -18]],
  },
  aoba: {
    aero: 'jake', at: [0, 9.4, -30], base: PI, back: -2, front: 16, out: -1.2,
    cut: [[-1.6, 1.6, 8.3, 10.2, -47, -28.5]],
  },
  furutaka: {
    aero: 'jake', at: [0, 9.2, -27.5], base: 0, back: -9, front: 11, out: 1.2,
    cut: [[-1.4, 1.4, 8.6, 9.6, -37, -14], [-7.5, 7.5, 9.6, 14, -34, -21]],
  },
  b65: {
    aero: 'jake', at: [0, 9.6, -20], base: PI, back: -9, front: 8, out: -1.2,
    cut: [[-1.6, 2.6, 8.6, 10.4, -29, -10], [-7, 7, 9.6, 14.5, -9.5, 1.5]],
  },
  // The aircraft cruisers: a catapult either side at the fore end of the
  // aircraft deck, abreast the mainmast, stowed aft and trained out.
  mogami: {
    aero: 'jake', pair: true, at: [5.6, 8.7, -25], base: PI, out: -1.3, back: -3, front: 14,
    cut: [[-4.5, 4.5, 7.9, 13, -46, -38]],
  },
  suzuya: {
    aero: 'jake', pair: true, at: [5.6, 8.5, -25.5], base: PI, out: -1.3, back: -3, front: 14,
  },
  tone: {
    aero: 'jake', pair: true, at: [5.2, 8.3, -36], base: PI, out: -1.2, back: -3, front: 15,
  },
  // Her great catapult on her quarterdeck, and the scout on it.
  oyodo: {
    aero: 'jake', at: [0, 8.6, -70], base: 0, back: -14, front: 14, out: 1.2,
    cut: [[-1.6, 1.6, 7.4, 9.2, -86, -54.5], [-8, 8, 8.8, 13, -82, -68]],
  },
  yodo: {
    aero: 'jake', pair: true, at: [5.0, 7.2, -100], base: 0, out: 1.1, back: -3, front: 15,
    cut: [[2, 6, 6.2, 9, -106, -84], [-7.5, -3.5, 6.2, 9, -106, -84]],
  },

  // ----------------------------------------------------- the others ----
  // The Littorio's: fixed on her quarterdeck, pointing aft, the scout thrown
  // off over her stern.
  roma: {
    aero: 'ro43', at: [0, 7.0, -93], base: PI, back: 0, front: 23, draw: false,
    cut: [[-7, 7, 7.4, 12, -118, -103]],
  },
  borgia: {
    aero: 'ro43', at: [0, 8.62, -88], base: PI, back: 0, front: 19, draw: false,
    cut: [[-6, 6, 8.95, 12.5, -101, -89]],
  },
  dunkerque: {
    aero: 'loire', at: [0, 9.6, -91], base: PI, back: -11.5, front: 11.5, out: 1.0,
    cut: [[-2, 2, 8.4, 10.8, -104, -78]],
  },
  // Trained out over her port side, as the model stood it.
  algerie: {
    aero: 'loire', at: [1, 11.2, 10.5], base: PI / 2, back: -2, front: 15,
    cut: [[1.6, 17, 9.0, 14.5, 4, 14]],
  },
  lorraine: {
    aero: 'loire', at: [0, 4.0, -68], base: PI, back: -3, front: 11, out: 0.9,
    cut: [[-4.6, 4.2, 3.0, 6.5, -71, -58]],
  },
  kirov: {
    aero: 'kor1', at: [0, 10.6, -1], base: 0, back: -9.5, front: 9.5, out: 1.2,
    cut: [[-1.4, 1.4, 9.9, 13, -11, 10]],
  },
  // A cross-deck catapult between her funnels, bare.
  hannover: {
    aero: 'arado', cross: true, at: [0, 6.9, -7.3], front: 8.5, draw: false,
  },
};
