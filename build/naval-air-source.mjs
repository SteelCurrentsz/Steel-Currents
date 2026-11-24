// The Nimitz's three aircraft, the Ka-27, and the Implacable's Seafire and
// Firefly, from the glbs the owner uploaded to the pieces the game flies.
//
//   node build/naval-air-source.mjs f18|e2d|sh60|ka27|seafire|firefly|f35|rafale|nh90|a5m|b4y|val|tenzan|corsair
//     ->  client/js/render/<kind>Model.data.js
//
// Wants the decimator and the image decoder (see build/sculpt-source.mjs):
//
//   npm i --no-save meshoptimizer@0.22 sharp
//
// Each is a Sketchfab export, credited on the game's Credits screen, under
// Creative Commons Attribution 4.0:
//
//   f18   "McDonnell Douglas F/A-18C Hornet" by Rhine_Lab_Muelsyse
//         (https://skfb.ly/puTvR) -- assets/models/mcdonnell_douglas_fa-18c_hornet.glb
//   e2d   "Grumman E-2D Advanced Hawkeye" by Muhamad Mirza Arrafi
//         (https://skfb.ly/pHKou) -- assets/models/grumman_e-2d_advanced_hawkeye-maximum-compressed.glb
//   sh60  "SH-60B Seahawk Helicopter" by Muhamad Mirza Arrafi
//         (https://skfb.ly/p96qS) -- assets/models/sh-60b_seahawk_helicopter-maximum-compressed.glb
//   ka27  "KA-27" by theutkarsh
//         (https://skfb.ly/poZTv) -- assets/models/ka-27-maximum-compressed.glb
//   seafire  "Supermarine Spitfire Mk.IIa" by barking_dogo
//         (https://skfb.ly/oyQIs) -- assets/models/supermarine_spitfire_mk.iia-maximum-compressed.glb,
//         repainted as a Fleet Air Arm Seafire (see its `recolour`)
//   firefly  the owner's Fairey Firefly F.I
//         -- assets/models/fairey_firefly_f.i-maximum-compressed.glb
//   f35   "F-35A Lightning II - USAF (WARNO mod)" by rran81 (Sketchfab), the
//         owner's upload -- assets/models/f-35a_lightning_ii__usaf_warno_mod-maximum-compressed.glb,
//         flown as the Ford's F-35C
//   rafale  "Dassault Rafale" by CloudHubOmniTeam (https://skfb.ly/oOHxM)
//         -- assets/models/dassault_rafale-maximum-compressed.glb, flown as the
//         Charles de Gaulle's Rafale M
//   nh90  "NH90 Caiman Door Gun - French Army (WARNO mod)" by rran81
//         (Sketchfab), the owner's upload --
//         assets/models/nh90_caiman_door_gun__french_army_warno_mod-maximum-compressed.glb,
//         flown as the Charles de Gaulle's Caiman
//
// What comes out, in her own frame -- nose +z, up +y, wheels on y = 0, put to
// her real length -- each piece painted at every point off the model's own
// textures:
//   body    her airframe
//   glass   her canopy, where the model draws it see-through
//   gear    her legs and wheels, which come up into her (the F/A-18's and
//           the Hawkeye's; a Seahawk's stay down)
//   spin    what turns, each about its own hub: the Hawkeye's two airscrews
//           and her rotodome, the Seahawk's main and tail rotors, a Seafire's
//           and a Firefly's airscrew
//
// PARTS=1 lists every run of faces of the model, by node, with its box: what
// a model's pieces are told apart by.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packPieceCompact } from './sculpt.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(process.env.SCULPT_TOOLS ? path.join(process.env.SCULPT_TOOLS, 'index.js') : import.meta.url);
const sharp = require('sharp');
const { MeshoptDecoder, MeshoptSimplifier } = require('meshoptimizer');
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
MeshoptSimplifier.useExperimentalFeatures = true;

const hyp = Math.hypot;
/**
 * Each of the three: her glb, her real length over all (nose to tail, rotors
 * folded away for the Seahawk: her fuselage), which way the model's nose
 * points, and the piece each face of the model goes to -- by the node it
 * came from where the model names its parts, and otherwise by where it is.
 */
const KINDS = {
  f18: {
    src: 'mcdonnell_douglas_fa-18c_hornet.glb', length: 17.07, keep: 0.85,
    // A Navy Hornet in the light gull grey over white she wore.
    piece: ({ node, mat }) => {
      if (mat === 1) return 'glass';
      if (/^(gear_|nose_gear)/.test(node)) return 'gear';
      return 'body';
    },
    spins: [],
  },
  e2d: {
    src: 'grumman_e-2d_advanced_hawkeye-maximum-compressed.glb', length: 17.6, keep: 0.28,
    piece: ({ c, mat }) => {
      const [x, y, z] = c;
      if (mat === 3) return 'glass';
      // Her two eight-bladed airscrews, on the fronts of her nacelles.
      if (z > 11.7 && z < 19.2 && hyp(Math.abs(x) - 17.69, y - 5.1) < 11) return x > 0 ? 'spin0' : 'spin1';
      // Her rotodome, on its two struts over her back.
      if (y > 16.1 && Math.abs(x) < 21 && z > -36 && z < 5.5) return 'spin2';
      // Her main legs under her nacelles, and her nose leg.
      if (Math.abs(x) > 14.5 && Math.abs(x) < 21 && y < -5.5 && z > -9 && z < -2) return 'gear';
      if (Math.abs(x) < 2.7 && y < -6 && z > 24 && z < 36.5) return 'gear';
      return 'body';
    },
    // Airscrews turn about the fore-and-aft (z); the dome about the vertical (y).
    spins: [
      { name: 'prop0', hub: [17.69, 5.1, 15], axis: 'z' },
      { name: 'prop1', hub: [-17.69, 5.1, 15], axis: 'z' },
      { name: 'dome', hub: [0, 18.4, -15.13], axis: 'y' },
    ],
  },
  sh60: {
    src: 'sh-60b_seahawk_helicopter-maximum-compressed.glb', length: 15.26, keep: 0.4,
    // Her length is her fuselage's, nose to tail rotor, not her rotor's sweep.
    lengthOf: 'body',
    piece: ({ c }) => {
      const [x, y, z] = c;
      if (x > 25 && z < -780 && hyp(y - 446, z + 895) < 200) return 'spin1';
      if (y > 395 && z > -600) return 'spin0';
      return 'body';
    },
    spins: [
      { name: 'rotor', hub: [2.3, 444, 264], axis: 'y' },
      { name: 'tail', hub: [34, 446, -895], axis: 'x' },
    ],
  },
  // The Ka-27 the Sovremenny and the Slava carry: her two rotors one over the
  // other on the one mast, the lower turning the other way (see RATE in
  // navalAirModel.js). The model has them as four meshes -- the hub and
  // swashplate and three of blades -- with the two rotors' blades in each,
  // so they are told apart by height: the upper's roots are at 5.8 m and the
  // lower's at 4.3, and both droop towards their tips.
  ka27: {
    src: 'ka-27-maximum-compressed.glb', length: 12.25, keep: 0.05,
    lengthOf: 'body',
    // The model carries no paint, so she is given hers here: Soviet naval
    // grey over a paler belly, her windows (Object_32) tinted dark, her
    // cockpit behind them dark, her wheels (Object_13) black, and her blades
    // a dark grey.
    paint: ({ c, piece, own }) => {
      if (piece === 'spin0' || piece === 'spin1') return [0.21, 0.22, 0.23];
      const i = Number(own.split('_')[1]) || 0;
      if (i === 32) return [0.13, 0.17, 0.21];
      if (i === 13) return [0.1, 0.1, 0.1];
      if ([14, 15, 16, 18, 19, 20].includes(i)) return [0.22, 0.23, 0.24];
      return c[1] < 1.0 ? [0.63, 0.66, 0.68] : [0.5, 0.55, 0.58];
    },
    piece: ({ c, own }) => {
      if (!/^Object_3[4-7]$/.test(own)) return 'body';
      const r = hyp(c[0] - 0.03, c[2] + 0.065);
      const split = r < 2 ? 4.55 : 5.05 - 1.1 * (r / 8) ** 2;
      return c[1] > split ? 'spin0' : 'spin1';
    },
    spins: [
      { name: 'rotor', hub: [0.03, 5.5, -0.065], axis: 'y' },
      { name: 'lower', hub: [0.03, 4.05, -0.065], axis: 'y' },
    ],
  },
  // The Gerald R. Ford's stealth fighter: the F-35C Lightning II, off the
  // owner's model of an F-35A (her airframe less her carrier's bigger wing
  // and her hook), at the F-35C's length.
  f35: {
    src: 'f-35a_lightning_ii__usaf_warno_mod-maximum-compressed.glb', length: 15.7, keep: 0.6, nose: '+x',
    piece: ({ node, mat }) => {
      if (mat === 1 || node === 'Window_58') return 'glass';
      if (node === 'Gear_35') return 'gear';
      return 'body';
    },
    spins: [],
  },
  // The Charles de Gaulle's Rafale M, off the owner's model of a Rafale:
  // "Dassault Rafale" by CloudHubOmniTeam (https://skfb.ly/oOHxM), under
  // Creative Commons Attribution 4.0. Drawn nose along -x, her canopy and her
  // lights in its glass materials; no legs of her own.
  rafale: {
    src: 'dassault_rafale-maximum-compressed.glb', length: 15.27, keep: 0.6, nose: '-x',
    piece: ({ mat }) => ([18, 19, 20, 21, 24, 25].includes(mat) ? 'glass' : 'body'),
    spins: [],
    guns: null,
  },
  // And her NH90 Caiman, off the owner's model of the army's: "NH90 Caiman
  // Door Gun - French Army (WARNO mod)" by rran81 (Sketchfab). Drawn nose along
  // +x. Her four-bladed main rotor and its head, her tail rotor and its
  // gearbox on her port side, her three wheels, and a machine gun in each
  // cabin door -- given a second each (`copies`), a metre aft of the first,
  // which is the two a side she carries here.
  nh90: {
    src: 'nh90_caiman_door_gun__french_army_warno_mod-maximum-compressed.glb', length: 16.13, keep: 0.5, nose: '+x',
    lengthOf: 'body',
    copies: [{ nodes: ['Tourelle_01_35', 'Axe_Canon_01_34', 'Canon_01_33', 'Tourelle_02_39', 'Axe_Canon_02_38', 'Canon_02_37'], d: [-1.1, 0, 0] }],
    piece: ({ mat, node }) => {
      if (mat === 2) return 'glass';
      if (/^(Helice_Ls_1|Bloc_Moteur_1)/.test(node)) return 'spin0';
      if (/^(Helice_Ls_2|Bloc_Moteur_2)/.test(node)) return 'spin1';
      if (/^Roue_/.test(node)) return 'gear';
      return 'body';
    },
    // In her frame once her nose is along +z: the main rotor over her cabin,
    // turning about the vertical; the tail rotor out to port of her fin,
    // turning about her span.
    spins: [
      { name: 'rotor', hub: [0, 4.35, -0.57], axis: 'y' },
      { name: 'tail', hub: [0.67, 3.98, -11.07], axis: 'x' },
    ],
  },
  // The Implacable's fighter: a Seafire, off the owner's Spitfire Mk.IIa --
  // the same airframe, hooked and navalised -- repainted in the Fleet Air
  // Arm's temperate sea scheme.
  seafire: {
    src: 'supermarine_spitfire_mk.iia-maximum-compressed.glb', length: 9.12, keep: 0.6,
    // Her two 20 mm Hispanos and four Brownings in her wings.
    guns: [[-2.1, 1.6, 2.9], [2.1, 1.6, 2.9]],
    piece: ({ c, mat, own }) => {
      const [x, y, z] = c;
      if (mat === 2) return 'glass';
      // Her airscrew -- three blades on the spinner's hub -- turns.
      if (own === 'Object_150' || own === 'Object_160') return 'spin0';
      // Her legs, wheels and doors, and her tail wheel.
      if (/^Object_(128|140|198|200|202|204|206|210|228|236|240|242)$/.test(own)) return 'gear';
      if (y < -0.9 && Math.abs(x) < 1.2 && z > 0.3 && z < 2.4) return 'gear';
      return 'body';
    },
    // The Fleet Air Arm's temperate sea scheme over the RAF's: Extra Dark Sea
    // Grey for her Dark Earth, Dark Slate Grey for her Dark Green, over the
    // Sky she already has under her; the red of her markings white, as the
    // British Pacific Fleet painted them out, and her squadron's codes gone.
    recolour: ([r, g, b], { low, ny, piece }) => {
      if (piece !== 'body') return [r, g, b];
      const l = (r + g + b) / 3, sat = Math.max(r, g, b) - Math.min(r, g, b);
      // Her roundels' blue stays; their red goes white.
      if (b > r + 0.08 && b > g + 0.04) return [r, g, b];
      if (r > 0.35 && r > g * 1.7 && r > b * 1.7) return [0.86, 0.86, 0.84];
      // Her squadron's letters, its chequer and her pale sand, on her upper
      // surfaces, painted out.
      // (Upper by where it stands or by which way the model says it looks:
      // her ailerons' tops are mapped off the Sky of her texture.)
      if ((!low || ny > 0.3) && sat < 0.11 && l > 0.42) return [0.30, 0.33, 0.35].map((v) => v * Math.min(1.25, l / 0.5));
      if (sat < 0.05) return [r, g, b];
      if (r >= g && r > b + 0.05) return [0.30, 0.33, 0.35].map((v) => v * Math.min(1.3, l / 0.42));
      if (g >= r - 0.02 && g > b + 0.02) return [0.24, 0.29, 0.25].map((v) => v * Math.min(1.3, l / 0.36));
      return [r, g, b];
    },
    spins: [{ name: 'prop', hub: [0, 0.065, 3.5], axis: 'z' }],
  },
  // And her strike fighter, the Fairey Firefly.
  firefly: {
    src: 'fairey_firefly_f.i-maximum-compressed.glb', length: 11.46, keep: 0.28,
    // Her four 20 mm Hispanos, two in each wing.
    guns: [[-2.95, 1.95, 2.7], [-2.55, 1.95, 2.7], [2.55, 1.95, 2.7], [2.95, 1.95, 2.7]],
    piece: ({ c, mat, own }) => {
      const [x, y, z] = c;
      if (mat === 4) return 'glass';
      // Her spinner and her three blades.
      if (own === 'Object_19') return 'spin0';
      if (own === 'Object_4' && z > 4.9 && (y > 2.6 || z > 5.06) && Math.hypot(x, y - 2.73) > 0.3) return 'spin0';
      // Her main legs and wheels, outboard under her centre section, and her
      // tail wheel.
      if (own === 'Object_4' && Math.abs(x) > 1.55 && Math.abs(x) < 2.1 && y < 1.6 && z > 2.2 && z < 3.7) return 'gear';
      if (own === 'Object_4' && Math.abs(x) < 0.25 && y < 0.9 && z < -3.0 && z > -3.95) return 'gear';
      return 'body';
    },
    spins: [{ name: 'prop', hub: [0, 2.73, 5.2], axis: 'z' }],
  },
  // The Hosho's fighter: the Mitsubishi A5M, the Navy's first carrier
  // monoplane -- "Claude" to the Allies -- off the owner's model of her, in
  // the model's own paint: her two-bladed airscrew turns, and her legs,
  // fixed and spatted, stay down.
  a5m: {
    src: 'Type96Claude-maximum-compressed.glb', length: 7.565, keep: 0.12, nose: '-x', comps: true, texture: 1024,
    // Her two Type 89s, in the top of her fuselage ahead of her windscreen.
    guns: [[-0.19, 2.39, 2.95], [0.19, 2.39, 2.95]],
    piece: ({ comp }) => (comp.lo[0] < -0.715 && comp.hi[0] < -0.67 ? 'spin0' : 'body'),
    spins: [{ name: 'prop', hub: [0.003, 0.004, 0.735], axis: 'z' }],
  },
  // And her attack aeroplane: the Yokosuka B4Y1 -- "Jean" -- the last
  // biplane the Navy took to sea, with a torpedo slung under her belly. The
  // model is bare, so she is given the paint of a carrier's attack aeroplane
  // of 1937 to 1942 here: ameiro, the Navy's grey-green, over all of her, her
  // engine black, her tail red as her carrier's fighters' are, the hinomaru on
  // her upper wing and under her lower, her airscrew bare metal with red tips,
  // and her torpedo the dark steel of a Type 91.
  b4y: {
    src: 'Type96Jean-maximum-compressed.glb', length: 10.15, keep: 0.045, storeKeep: 0.2, nose: '-x', comps: true,
    piece: ({ o, comp }) => {
      // Her torpedo: a piece of the model of its own, under her belly.
      if (comp.n > 5000 && comp.n < 40000 && comp.hi[1] < -0.05) return 'store';
      // Her airscrew and its hub, ahead of her engine.
      if (o[0] < -0.6895 && Math.hypot(o[1] - 0.094, o[2]) < 0.3) return 'spin0';
      return 'body';
    },
    stores: ['store'],
    // The model's frame: her nose at -x, her span along z, her airscrew's hub
    // 0.094 up; her upper wing's skins between 0.2 and 0.29 up, her lower
    // wing's between -0.1 and 0.06; her fin from 0.476 aft, her tailplane
    // from 0.43.
    // Her torpedo, which is not on the texture: a Type 91's warhead darker
    // than her air vessel and her tail. (And what the rest of her is at each
    // corner, where a texture cannot be drawn.)
    // (Corner colours are drawn as they stand, where her texture is
    // decoded from sRGB: they are given here in light, not in paint.)
    paint: ({ o, piece }) => (piece === 'store' ? (o[0] < -0.105 ? [0.2, 0.21, 0.22] : [0.28, 0.29, 0.3])
      : piece === 'spin0' ? [0.6, 0.59, 0.56] : [0.64, 0.63, 0.53]).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)),
    atlas: {
      size: 2048, pieces: ['body', 'spin0'],
      layer: ({ o: [x, y, z], axis, sign, piece }) => {
        if (piece !== 'body') return 'p';
        // Her tyres and her tail wheel, under: black.
        if (axis === 1 && sign < 0 && (y < -0.255 || (x > 0.52 && y < -0.13))) return 'k';
        if (axis === 1 && sign > 0 && y > 0.2 && x > -0.41 && x < -0.12) return 'uw';
        if (axis === 1 && sign < 0 && y < 0.06 && y > -0.1 && x > -0.38 && x < -0.09 && Math.abs(z) > 0.1) return 'lw';
        if (axis === 2) return Math.abs(z) < 0.1 ? 'f' : 'o';
        if (axis === 0) return x < -0.52 ? 'n' : x > 0.432 ? 't' : 'm';
        return 'o';
      },
      paint: ({ piece, axis, layer, a, b }) => {
        const AMEIRO = [0.64, 0.63, 0.53], RED = [0.66, 0.09, 0.09], BLACK = [0.08, 0.08, 0.08];
        const ENGINE = [0.15, 0.15, 0.16];
        if (piece === 'spin0') {
          // Bare metal, red at the tips, the hub dark.
          const r = axis === 0 ? Math.hypot(b - 0.094, a) : axis === 1 ? Math.abs(b) : Math.abs(b - 0.094);
          if (r > 0.224 && r < 0.241) return RED;
          if (r < 0.06) return [0.2, 0.2, 0.21];
          return [0.6, 0.59, 0.56];
        }
        if (layer === 'k') return BLACK;
        const R = 0.085, TAIL = 0.432, NOSE = -0.52;
        if (axis === 1) {
          const [x, z] = [a, b];
          if (x < NOSE && Math.abs(z) < 0.215) return ENGINE;
          if (layer === 'uw' && Math.hypot(x + 0.267, Math.abs(z) - 0.74) < R) return RED;
          if (layer === 'lw' && Math.hypot(x + 0.237, Math.abs(z) - 0.74) < R) return RED;
          if (x > TAIL) return RED;
          return AMEIRO;
        }
        if (axis === 2) {
          const [x, y] = [a, b];
          if (y < -0.255) return BLACK;
          if (x > 0.52 && y < -0.13 && layer === 'f') return BLACK;
          if (x < NOSE && Math.abs(y - 0.094) < 0.215) return ENGINE;
          if (x > TAIL) return RED;
          return AMEIRO;
        }
        const [z, y] = [a, b];
        if (y < -0.255) return BLACK;
        if (layer === 'n' && Math.hypot(y - 0.094, z) < 0.215) return ENGINE;
        if (layer === 't') return y < -0.13 ? BLACK : RED;
        return AMEIRO;
      },
    },
    spins: [{ name: 'prop', hub: [0, 0.094, 0.70], axis: 'z' }],
  },
  // The Akagi's and the Soryu's dive bomber: the Aichi D3A1 -- "Val" --
  // fixed legs in their spats, elliptical wings, a 250 kg bomb on the
  // swinging crutch under her belly that throws it clear of her airscrew in
  // the dive, and her gunner's Type 92 on its ring at the back of her long
  // glasshouse. The model is bare: she is painted here in the ameiro of the
  // carriers' aircraft of 1941-42, her cowling black, the hinomaru on her
  // upper and lower wings and her fuselage sides, and her carrier's red band
  // round her tail.
  val: {
    src: 'AichiD3AVal.glb', length: 10.2, keep: 0.035, nose: '-x', comps: true,
    // Her two Type 97s, in the top of her cowling.
    guns: [[-0.25, 2.62, 3.75], [0.25, 2.62, 3.75]],
    // The model's frame: her nose at -x, her span along z, her airscrew's
    // hub 0.05 up; the model is one welded skin, so her airscrew is told
    // from her cowling by where it is: its spinner forward of -0.706, and
    // its blades, which sweep out past the cowling's lip.
    piece: ({ o: [x, y, z] }) => (x < -0.706 || (x < -0.66 && Math.hypot(y - 0.05, z) > 0.158) ? 'spin0' : 'body'),
    paint: ({ piece }) => (piece === 'spin0' ? [0.6, 0.59, 0.56] : [0.64, 0.63, 0.53]).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)),
    atlas: {
      size: 2048, pieces: ['body', 'spin0'],
      layer: ({ o: [x, y, z], axis, sign, piece }) => {
        if (piece !== 'body') return 'p';
        // Her tyres, in the bottoms of her spats: black.
        if (y < -0.245 && Math.abs(z) > 0.18) return 'k';
        // Her long glasshouse over her two cockpits.
        if (x > -0.335 && x < 0.1 && (y > 0.142 || (y > 0.115 && Math.abs(z) < 0.095 && axis === 2))) return 'g';
        if (axis === 1) return Math.abs(z) > 0.16 ? (sign > 0 ? 'uw' : 'lw') : 'f';
        if (axis === 0) return x < -0.5 ? 'n' : x > 0.5 ? 't' : 'm';
        return Math.abs(z) < 0.16 ? 'f' : 'o';
      },
      paint: ({ piece, axis, layer, a, b }) => {
        const AMEIRO = [0.64, 0.63, 0.53], RED = [0.66, 0.09, 0.09], BLACK = [0.08, 0.08, 0.08], WHITE = [0.86, 0.86, 0.84];
        const COWL = [0.1, 0.1, 0.11];
        if (piece === 'spin0') {
          // Bare metal, red at the tips, the spinner metal.
          const r = axis === 0 ? Math.hypot(b - 0.05, a) : axis === 1 ? Math.abs(b) : Math.abs(b - 0.05);
          if (r > 0.255) return RED;
          return [0.6, 0.59, 0.56];
        }
        if (layer === 'k') return BLACK;
        // Her glasshouse: glass, framed every so often along it.
        if (layer === 'g') {
          const along = axis === 0 ? 0 : a;
          return ((along + 0.335) % 0.072) < 0.009 ? [0.42, 0.42, 0.36] : [0.24, 0.3, 0.33];
        }
        // Her cowling, back to its gills; the Akagi's red band round her
        // after fuselage; the hinomaru on her wings, top and bottom, and on
        // her sides, with a white ring round the ones on her sides.
        const COWL_AFT = -0.535, BAND = [0.37, 0.415];
        const disc = (d, R, ring) => (d < R ? RED : ring && d < R + 0.012 ? WHITE : null);
        if (axis === 1) {
          const [x, z] = [a, b];
          if (x < COWL_AFT && Math.abs(z) < 0.16) return COWL;
          if (layer === 'uw' || layer === 'lw') return disc(Math.hypot(x + 0.265, Math.abs(z) - 0.7), 0.075) || AMEIRO;
          if (x > BAND[0] && x < BAND[1]) return RED;
          return AMEIRO;
        }
        if (axis === 2) {
          const [x, y] = [a, b];
          if (x < COWL_AFT && layer === 'f') return COWL;
          if (layer === 'f' && x > BAND[0] && x < BAND[1]) return RED;
          if (layer === 'f') return disc(Math.hypot(x - 0.2, y + 0.02), 0.05, true) || AMEIRO;
          return AMEIRO;
        }
        const [z, y] = [a, b];
        if (layer === 'n') return Math.hypot(y - 0.05, z) < 0.16 ? COWL : AMEIRO;
        return AMEIRO;
      },
    },
    spins: [{ name: 'prop', hub: [0, 0.05, 0.75], axis: 'z' }],
  },
  // The Illustrious's fighter: the Vought F4U Corsair, the bent-winged
  // fighter-bomber the Fleet Air Arm flew off its armoured carriers before
  // the US Navy would fly her off its own, off the owner's model of her.
  // The model is one bare welded skin, wheels down: her airscrew, her legs
  // and her tailwheel are told from her airframe by where they are, and she
  // is painted here as the British Pacific Fleet's Corsairs of 1945 were --
  // Glossy Sea Blue all over, her airscrew black with yellow tips, and the
  // Fleet's blue-and-white roundels on her wings and her sides, with the
  // white bars either side of the ones on her fuselage.
  corsair: {
    src: 'F4UCorsair-maximum-compressed.glb', length: 10.2, keep: 0.05, nose: '-x',
    // Her Hamilton Standard airscrew had three blades; the model draws two of
    // them, a third of a turn apart, and her third is put back.
    addBlade: { x: -0.69, hub: [0.143, 0], r: 0.06, pick: (y, z) => z > 0 },
    // Her six .50 Brownings, three in each outer wing.
    guns: [[-3.3, 1.8, 2.9], [-3.0, 1.8, 2.9], [-2.7, 1.8, 2.9], [2.7, 1.8, 2.9], [3.0, 1.8, 2.9], [3.3, 1.8, 2.9]],
    // The model's frame: her nose at -x, her span along z, her airscrew's
    // hub 0.143 up; her cowling's lip at -0.69; her main legs under the
    // bend of her wings, her tailwheel under her tail.
    piece: ({ o: [x, y, z] }) => {
      if (x < -0.69) return 'spin0';
      if (x > -0.58 && x < -0.37 && Math.abs(z) > 0.2 && Math.abs(z) < 0.34 && y < -0.115) return 'gear';
      if (x > 0.44 && x < 0.54 && Math.abs(z) < 0.05 && y < -0.16) return 'gear';
      return 'body';
    },
    paint: ({ piece }) => (piece === 'spin0' ? [0.08, 0.08, 0.08] : piece === 'gear' ? [0.11, 0.15, 0.24] : [0.11, 0.15, 0.24])
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)),
    atlas: {
      size: 2048, pieces: ['body', 'spin0'],
      layer: ({ o: [x, y, z], axis, sign, piece }) => {
        if (piece !== 'body') return 'p';
        // Her canopy, over her cockpit well aft of her wings.
        if (x > -0.1 && x < 0.22 && y > 0.175 && Math.abs(z) < 0.08) return 'g';
        if (axis === 1) return Math.abs(z) > 0.13 ? (sign > 0 ? 'uw' : 'lw') : 'f';
        if (axis === 0) return x < -0.55 ? 'n' : 'm';
        return Math.abs(z) < 0.13 ? 'f' : 'o';
      },
      paint: ({ piece, axis, layer, a, b }) => {
        const BLUE = [0.11, 0.15, 0.24], ROUNDEL = [0.05, 0.08, 0.3], WHITE = [0.86, 0.86, 0.84];
        const BLACK = [0.07, 0.07, 0.07], YELLOW = [0.85, 0.7, 0.1];
        if (piece === 'spin0') {
          // Black blades, yellow at the tips.
          const r = axis === 0 ? Math.hypot(b - 0.143, a) : axis === 1 ? Math.abs(b) : Math.abs(b - 0.143);
          return r > 0.175 ? YELLOW : BLACK;
        }
        if (layer === 'g') return [0.24, 0.3, 0.33];
        const roundel = (d, R) => (d < R * 0.45 ? WHITE : d < R ? ROUNDEL : null);
        if (axis === 1) {
          const [x, z] = [a, b];
          if (layer === 'uw' || layer === 'lw') return roundel(Math.hypot(x + 0.27, Math.abs(z) - 0.68), 0.075) || BLUE;
          return BLUE;
        }
        if (axis === 2) {
          const [x, y] = [a, b];
          if (layer === 'f') {
            // Her fuselage roundel, and the white bar either side of it.
            const d = Math.hypot(x - 0.33, y - 0.0);
            const r = roundel(d, 0.06);
            if (r) return r;
            if (Math.abs(y) < 0.025 && Math.abs(x - 0.33) < 0.13) return WHITE;
          }
          return BLUE;
        }
        return BLUE;
      },
    },
    spins: [{ name: 'prop', hub: [0, 0.143, 0.74], axis: 'z' }],
  },
  // The Taiho's torpedo bomber: the Nakajima B6N2 Tenzan -- "Jill" -- off
  // the owner's model of her: a Kasei under a long cowling, her three crew
  // under one long glasshouse, her Type 91 slung off to starboard of her
  // centreline on its crutches, her legs folding back into her wings, and
  // her tailwheel. The model is one welded skin sat on its tailwheel: she
  // is levelled first (`tilt`), and her airscrew, her torpedo and her legs
  // are told from her airframe by where they are. The model is bare: she
  // is painted here as the carriers' Tenzans of 1944 were, a dark green
  // over grey, her cowling black, the hinomaru on her wings and her sides.
  tenzan: {
    src: 'Tenzan.glb', length: 10.87, keep: 0.035, storeKeep: 0.3, nose: '-x',
    // Nose up twelve degrees on her tailwheel, as the model sits her.
    tilt: 0.2094,
    // Her one Type 97, in her port wing.
    guns: [[2.5, 1.95, 2.4]],
    piece: ({ o: [x, y, z] }) => {
      // Her airscrew and its spinner, ahead of her cowling's lip.
      if (x < -0.612) return 'spin0';
      // Her Type 91, under her belly: round its own axis, which runs a hair
      // nose-down; its ogive nose slimmer than its body, clear of her oil
      // cooler's scoop.
      if (Math.abs(z) < 0.06 && x > -0.55 && x < 0.26) {
        const r = Math.hypot(y - (-0.172 + (x + 0.0) * 0.034), z);
        if (r < (x < -0.42 ? 0.04 : x > 0.04 ? 0.062 : 0.048)) return 'store';
      }
      // Her main legs and wheels, out under her wings; and her tailwheel.
      if (x > -0.4 && x < -0.12 && Math.abs(z) > 0.24 && Math.abs(z) < 0.4 && y < -0.08) return 'gear';
      if (x > 0.5 && x < 0.66 && Math.abs(z) < 0.04 && y < -0.095) return 'gear';
      return 'body';
    },
    stores: ['store'],
    paint: ({ o: [x], piece }) => (piece === 'store' ? (x < -0.3 ? [0.2, 0.21, 0.22] : [0.3, 0.31, 0.32])
      : piece === 'gear' ? [0.4, 0.4, 0.38] : piece === 'spin0' ? [0.36, 0.25, 0.17] : [0.2, 0.25, 0.18])
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)),
    atlas: {
      size: 2048, pieces: ['body', 'spin0'],
      layer: ({ o: [x, y, z], axis, sign, piece }) => {
        if (piece !== 'body') return 'p';
        // Her glasshouse over her three cockpits.
        if (x > -0.33 && x < 0.2 && y > 0.055 && Math.abs(z) < 0.075) return 'g';
        if (axis === 1) return sign > 0 ? 'u' : 'l';
        if (axis === 0) return x < -0.4 ? 'n' : x > 0.45 ? 't' : 'm';
        return Math.abs(z) < 0.12 ? 'f' : 'o';
      },
      paint: ({ piece, axis, layer, a, b }) => {
        const GREEN = [0.2, 0.25, 0.18], GREY = [0.62, 0.62, 0.55], RED = [0.66, 0.09, 0.09];
        const WHITE = [0.86, 0.86, 0.84], COWL = [0.1, 0.1, 0.11], YELLOW = [0.85, 0.6, 0.1];
        if (piece === 'spin0') {
          // Brown blades with yellow tips; the spinner bare metal.
          const r = axis === 0 ? Math.hypot(b + 0.015, a) : axis === 1 ? Math.abs(b) : Math.abs(b + 0.015);
          if (r > 0.165) return YELLOW;
          if (r < 0.04) return [0.55, 0.55, 0.53];
          return [0.36, 0.25, 0.17];
        }
        // Her glasshouse: glass, framed every so often along it.
        if (layer === 'g') {
          const along = axis === 0 ? 0 : a;
          return ((along + 0.33) % 0.065) < 0.008 ? [0.18, 0.22, 0.16] : [0.24, 0.3, 0.33];
        }
        const COWL_AFT = -0.4;
        const disc = (d, R, ring) => (d < R ? RED : ring && d < R + 0.013 ? WHITE : null);
        if (axis === 1) {
          const [x, z] = [a, b];
          if (x < COWL_AFT && Math.abs(z) < 0.12) return COWL;
          if (layer === 'u') {
            // Yellow along her wings' leading edges, inboard: the recognition
            // strips of 1944.
            if (Math.abs(z) > 0.14 && Math.abs(z) < 0.55 && x < -0.354 + (Math.abs(z) - 0.14) * 0.15 + 0.035) return YELLOW;
            return disc(Math.hypot(x + 0.16, Math.abs(z) - 0.68), 0.075, true) || GREEN;
          }
          return disc(Math.hypot(x + 0.16, Math.abs(z) - 0.68), 0.075) || GREY;
        }
        if (axis === 2) {
          const [x, y] = [a, b];
          if (x < COWL_AFT && layer === 'f') return COWL;
          if (layer === 'f') {
            const h = disc(Math.hypot(x - 0.26, y + 0.025), 0.05, true);
            if (h) return h;
            return y > -0.035 + (x > 0.3 ? (x - 0.3) * 0.08 : 0) ? GREEN : GREY;
          }
          return y > -0.06 ? GREEN : GREY;
        }
        const [z, y] = [a, b];
        if (layer === 'n') return Math.hypot(y + 0.03, z) < 0.13 ? COWL : GREEN;
        return y > -0.035 ? GREEN : GREY;
      },
    },
    spins: [{ name: 'prop', hub: [0, -0.015, 0.63], axis: 'z' }],
  },
};
const KIND = process.argv[2];
const K = KINDS[KIND];
if (!K) throw new Error(`which aircraft? ${Object.keys(KINDS).join(', ')}`);
const SRC = path.join(ROOT, 'assets/models', K.src);
const OUT = path.join(ROOT, `client/js/render/${KIND}Model.data.js`);

// ---- the glb, flattened -------------------------------------------------
const mul = (a, b) => {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
};
function compose(n) {
  if (n.matrix) return Float64Array.from(n.matrix);
  const [tx, ty, tz] = n.translation || [0, 0, 0];
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale || [1, 1, 1];
  return Float64Array.from([
    (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
    (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
    (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ]);
}
function flatten(buf) {
  const jl = buf.readUInt32LE(12);
  const j = JSON.parse(buf.subarray(20, 20 + jl).toString());
  const bin = buf.subarray(20 + jl + 8);
  const views = j.bufferViews.map((v) => {
    const e = v.extensions && v.extensions.EXT_meshopt_compression;
    if (!e) return bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
    const out = new Uint8Array(e.count * e.byteStride);
    MeshoptDecoder.decodeGltfBuffer(out, e.count, e.byteStride,
      bin.subarray(e.byteOffset || 0, (e.byteOffset || 0) + e.byteLength), e.mode, e.filter);
    return Buffer.from(out.buffer);
  });
  const TYPE = {
    5120: ['getInt8', 1, 127], 5121: ['getUint8', 1, 255], 5122: ['getInt16', 2, 32767],
    5123: ['getUint16', 2, 65535], 5125: ['getUint32', 4, 1], 5126: ['getFloat32', 4, 1],
  };
  const acc = (i) => {
    const a = j.accessors[i];
    const v = j.bufferViews[a.bufferView];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const [get, size, max] = TYPE[a.componentType];
    const b = views[a.bufferView];
    const e = v.extensions && v.extensions.EXT_meshopt_compression;
    const stride = v.byteStride || (e && e.byteStride) || n * size;
    const dv = new DataView(b.buffer, b.byteOffset + (a.byteOffset || 0));
    const out = new Float64Array(a.count * n);
    for (let k = 0; k < a.count; k++) {
      for (let c = 0; c < n; c++) {
        const x = dv[get](k * stride + c * size, true);
        out[k * n + c] = a.normalized ? Math.max(-1, x / max) : x;
      }
    }
    return { out, n };
  };
  const P = [], UV = [], T = [], M = [], L = [], NY = [];
  const walk = (ni, parent) => {
    const n = j.nodes[ni];
    const w = mul(parent, compose(n));
    if (n.mesh !== undefined) {
      const det = w[0] * (w[5] * w[10] - w[6] * w[9]) - w[4] * (w[1] * w[10] - w[2] * w[9])
        + w[8] * (w[1] * w[6] - w[2] * w[5]);
      for (const prim of j.meshes[n.mesh].primitives) {
        if (prim.mode !== undefined && prim.mode !== 4) continue;
        const pos = acc(prim.attributes.POSITION);
        const uv = prim.attributes.TEXCOORD_0 !== undefined ? acc(prim.attributes.TEXCOORD_0) : null;
        const nrm = prim.attributes.NORMAL !== undefined ? acc(prim.attributes.NORMAL) : null;
        const base = P.length / 3;
        const nv = pos.out.length / pos.n;
        for (let k = 0; k < nv; k++) {
          const x = pos.out[k * pos.n], y = pos.out[k * pos.n + 1], z = pos.out[k * pos.n + 2];
          P.push(w[0] * x + w[4] * y + w[8] * z + w[12], w[1] * x + w[5] * y + w[9] * z + w[13],
            w[2] * x + w[6] * y + w[10] * z + w[14]);
          if (uv) UV.push(uv.out[k * 2], uv.out[k * 2 + 1]); else UV.push(0, 0);
          if (nrm) {
            const a = nrm.out[k * 3], b = nrm.out[k * 3 + 1], c = nrm.out[k * 3 + 2];
            const nx = w[0] * a + w[4] * b + w[8] * c, ny = w[1] * a + w[5] * b + w[9] * c, nz = w[2] * a + w[6] * b + w[10] * c;
            const l = Math.hypot(nx, ny, nz) || 1;
            NY.push(ny / l);
          } else NY.push(0);
        }
        const idx = prim.indices !== undefined ? acc(prim.indices).out : Float64Array.from({ length: nv }, (_, i) => i);
        for (let t = 0; t < idx.length; t += 3) {
          if (det < 0) T.push(base + idx[t], base + idx[t + 2], base + idx[t + 1]);
          else T.push(base + idx[t], base + idx[t + 1], base + idx[t + 2]);
          M.push(prim.material ?? -1);
          // The part the model names: the node's own name, or its parent's
          // where the mesh hangs off a node of the part's name.
          L.push(ni);
        }
      }
    }
    for (const c of n.children || []) walk(c, w);
  };
  const I = Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  for (const r of j.scenes[j.scene || 0].nodes) walk(r, I);
  return { P, UV, T, M, L, NY, j, views };
}
const model = flatten(readFileSync(SRC));
const { j, P, UV } = model;
// A model drawn nose along +x is turned to put it along +z, about her
// vertical, and stays a right-handed aeroplane.
// The model's own frame, kept: what a kind's `piece` and `paint` are written
// in (`o`), whichever way her nose is turned.
// `tilt`: a model sat on its tailwheel is levelled first, turned about its
// span (the model's z) by that many radians, nose down.
if (K.tilt) {
  const c = Math.cos(K.tilt), sn = Math.sin(K.tilt);
  for (let i = 0; i < P.length; i += 3) { const x = P[i], y = P[i + 1]; P[i] = x * c - y * sn; P[i + 1] = x * sn + y * c; }
}
// `addBlade`: a model whose airscrew is drawn a blade short -- two blades a
// third of a turn apart, the third left off -- is given it: the faces of one
// blade (forward of `x`, off the hub's centre by more than `r`, on the side
// `pick` says), copied and turned about the hub's axis, along the model's x,
// into the empty third of the disc.
if (K.addBlade) {
  const { x: X0, hub: [hy, hz], r: R0, pick } = K.addBlade;
  const nT = T0Len();
  function T0Len() { return model.T.length / 3; }
  const angOf = (y, z) => Math.atan2(y - hy, z - hz);
  const sel = [], other = [];
  for (let t = 0; t < nT; t++) {
    const c = [0, 1, 2].map((k) => (P[model.T[t * 3] * 3 + k] + P[model.T[t * 3 + 1] * 3 + k] + P[model.T[t * 3 + 2] * 3 + k]) / 3);
    if (c[0] > X0 || Math.hypot(c[1] - hy, c[2] - hz) < R0) continue;
    (pick(c[1], c[2]) ? sel : other).push([t, angOf(c[1], c[2])]);
  }
  const mean = (a) => Math.atan2(a.reduce((q, [, v]) => q + Math.sin(v), 0), a.reduce((q, [, v]) => q + Math.cos(v), 0));
  const a1 = mean(sel), a2 = mean(other);
  const gap = (v) => Math.min(Math.abs(Math.atan2(Math.sin(v - a1), Math.cos(v - a1))), Math.abs(Math.atan2(Math.sin(v - a2), Math.cos(v - a2))));
  const turn = [2 * Math.PI / 3, -2 * Math.PI / 3].sort((p, q) => gap(a1 + q) - gap(a1 + p))[0];
  const c = Math.cos(turn), sn = Math.sin(turn);
  const map = new Map();
  for (const [t] of sel) {
    const tri = [];
    for (let k = 0; k < 3; k++) {
      const v = model.T[t * 3 + k];
      let nv = map.get(v);
      if (nv === undefined) {
        nv = P.length / 3;
        // Turned about the hub: (z, y) about (hz, hy) by `turn`, so the angle
        // atan2(y, z) grows by it.
        const dz = P[v * 3 + 2] - hz, dy = P[v * 3 + 1] - hy;
        P.push(P[v * 3], hy + dz * sn + dy * c, hz + dz * c - dy * sn);
        UV.push(UV[v * 2] || 0, UV[v * 2 + 1] || 0);
        model.NY.push(0);
        map.set(v, nv);
      }
      tri.push(nv);
    }
    model.T.push(...tri); model.M.push(model.M[t]); model.L.push(model.L[t]);
  }
  console.log(`addBlade: ${sel.length} faces of a blade at ${(a1 * 180 / Math.PI).toFixed(0)} deg copied to ${((a1 + turn) * 180 / Math.PI).toFixed(0)} deg (the other at ${(a2 * 180 / Math.PI).toFixed(0)})`);
}
// `copies`: the faces of the pieces named, drawn again moved by `d` in the
// model's own frame -- a second door gun beside the first.
for (const { nodes, d } of K.copies || []) {
  const parent = new Map();
  j.nodes.forEach((n, i) => (n.children || []).forEach((c) => parent.set(c, i)));
  const named = (ni) => nodes.includes(j.nodes[ni].name) || nodes.includes((j.nodes[parent.get(ni)] || {}).name);
  const nT = model.T.length / 3;
  const map = new Map();
  let n = 0;
  for (let t = 0; t < nT; t++) {
    if (!named(model.L[t])) continue;
    const tri = [];
    for (let k = 0; k < 3; k++) {
      const v = model.T[t * 3 + k];
      let w = map.get(v);
      if (w === undefined) {
        w = P.length / 3;
        P.push(P[v * 3] + d[0], P[v * 3 + 1] + d[1], P[v * 3 + 2] + d[2]);
        UV.push(UV[v * 2] || 0, UV[v * 2 + 1] || 0);
        model.NY.push(model.NY[v] || 0);
        map.set(v, w);
      }
      tri.push(w);
    }
    model.T.push(...tri); model.M.push(model.M[t]); model.L.push(model.L[t]);
    n++;
  }
  console.log(`copies: ${n} faces of ${nodes.join(', ')} drawn again, moved ${d.join(', ')}`);
}
const P0 = Float64Array.from(P);
if (K.nose === '+x') {
  for (let i = 0; i < P.length; i += 3) { const x = P[i], z = P[i + 2]; P[i] = -z; P[i + 2] = x; }
}
// And one drawn nose along -x the other way round.
if (K.nose === '-x') {
  for (let i = 0; i < P.length; i += 3) { const x = P[i], z = P[i + 2]; P[i] = z; P[i + 2] = -x; }
}
const centroid = (A, t) => [0, 1, 2].map((k) => (A[model.T[t * 3] * 3 + k] + A[model.T[t * 3 + 1] * 3 + k] + A[model.T[t * 3 + 2] * 3 + k]) / 3);
// `comps`: every run of faces that share corners -- by index, as the model
// was built, not welded by where they stand -- and the box of each, in the
// model's own frame: a torpedo slung under her, or a spinner and its blades,
// told apart from the airframe they touch.
let COMP = null;
if (K.comps) {
  const nv = P.length / 3;
  const up = new Int32Array(nv).map((_, i) => i);
  const find = (a) => { while (up[a] !== a) { up[a] = up[up[a]]; a = up[a]; } return a; };
  const T0 = model.T;
  for (let t = 0; t < T0.length; t += 3) { up[find(T0[t + 1])] = find(T0[t]); up[find(T0[t + 2])] = find(T0[t]); }
  const boxes = new Map();
  COMP = new Array(T0.length / 3);
  for (let t = 0; t < T0.length / 3; t++) {
    const r = find(T0[t * 3]);
    let b = boxes.get(r);
    if (!b) boxes.set(r, b = { n: 0, lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] });
    b.n++;
    for (let k = 0; k < 3; k++) { const v = T0[t * 3 + k]; for (let c = 0; c < 3; c++) { b.lo[c] = Math.min(b.lo[c], P0[v * 3 + c]); b.hi[c] = Math.max(b.hi[c], P0[v * 3 + c]); } }
    COMP[t] = b;
  }
}
if (K.prep) K.prep({ model, P0, centroid, COMP });
const parentOf = new Map();
j.nodes.forEach((n, i) => (n.children || []).forEach((c) => parentOf.set(c, i)));
const nameOf = (ni) => (j.nodes[parentOf.get(ni)] || {}).name || j.nodes[ni].name || '';

// PARTS=1: every run of faces that hang together, by node, with its box in
// the model's own frame -- what her pieces are told apart by.
if (process.env.PARTS) {
  const id = new Map(), up = [];
  const find = (a) => { while (up[a] !== a) { up[a] = up[up[a]]; a = up[a]; } return a; };
  const node = (v) => {
    const k = `${Math.round(P[v * 3] * 1e4)},${Math.round(P[v * 3 + 1] * 1e4)},${Math.round(P[v * 3 + 2] * 1e4)}`;
    let i = id.get(k);
    if (i === undefined) { i = up.length; id.set(k, i); up.push(i); }
    return i;
  };
  const n = model.T.length / 3, first = [];
  for (let t = 0; t < n; t++) {
    const a = node(model.T[t * 3]), b = node(model.T[t * 3 + 1]), c = node(model.T[t * 3 + 2]);
    up[find(b)] = find(a); up[find(c)] = find(a); first.push(a);
  }
  const runs = new Map();
  for (let t = 0; t < n; t++) {
    const r = `${model.L[t]}:${find(first[t])}`;
    let q = runs.get(r);
    if (!q) runs.set(r, q = { node: j.nodes[model.L[t]].name, mat: model.M[t], n: 0, lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] });
    q.n++;
    for (let k = 0; k < 3; k++) { const v = model.T[t * 3 + k]; for (let c = 0; c < 3; c++) { q.lo[c] = Math.min(q.lo[c], P[v * 3 + c]); q.hi[c] = Math.max(q.hi[c], P[v * 3 + c]); } }
  }
  for (const q of [...runs.values()].filter((q) => q.n >= +(process.env.PARTS_MIN || 20)).sort((a, b) => b.n - a.n)) {
    console.log(`${q.node} m${q.mat} ${q.n}t x ${q.lo[0].toFixed(2)}..${q.hi[0].toFixed(2)} y ${q.lo[1].toFixed(2)}..${q.hi[1].toFixed(2)} z ${q.lo[2].toFixed(2)}..${q.hi[2].toFixed(2)}`);
  }
  process.exit(0);
}

// ---- sort every face into the piece it belongs to -------------------------
const nt = model.T.length / 3;
const PIECE = new Array(nt);
for (let t = 0; t < nt; t++) {
  const c = [0, 1, 2].map((k) => (P[model.T[t * 3] * 3 + k] + P[model.T[t * 3 + 1] * 3 + k] + P[model.T[t * 3 + 2] * 3 + k]) / 3);
  PIECE[t] = K.piece({ c, o: centroid(P0, t), comp: COMP && COMP[t], mat: model.M[t], node: nameOf(model.L[t]), own: j.nodes[model.L[t]].name || '' });
}

// ---- her frame ------------------------------------------------------------
// Nose along +z: whichever end of her her canopy (or, lacking glass, the
// forward of her two ends by where most of her is) is nearer.
const box = (pick) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < nt; t++) {
    if (!pick(t)) continue;
    for (let k = 0; k < 3; k++) {
      const v = model.T[t * 3 + k];
      for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], P[v * 3 + c]); hi[c] = Math.max(hi[c], P[v * 3 + c]); }
    }
  }
  return [lo, hi];
};
const [alo, ahi] = box(() => true);
const [llo, lhi] = K.lengthOf ? box((t) => PIECE[t] === K.lengthOf) : [alo, ahi];
// Put to her real length -- or, where the model's proportions are its own,
// to her real span.
const S = K.span ? K.span / (ahi[0] - alo[0]) : K.length / (lhi[2] - llo[2]);
// Centred on her length and across her; her wheels (her lowest point) on y = 0.
const ORIGIN = [(alo[0] + ahi[0]) / 2, alo[1], (llo[2] + lhi[2]) / 2];
const toHer = (x, y, z) => [(x - ORIGIN[0]) * S, (y - ORIGIN[1]) * S, (z - ORIGIN[2]) * S];
console.log(`${KIND}: ${nt} faces, x${S.toFixed(5)}, ${((ahi[0] - alo[0]) * S).toFixed(2)} m across, ${((ahi[1] - alo[1]) * S).toFixed(2)} m high`);

// ---- her paint ------------------------------------------------------------
const tex = new Map();
async function texture(mi) {
  if (tex.has(mi)) return tex.get(mi);
  const mat = j.materials[mi] || {};
  const pbr = mat.pbrMetallicRoughness || {};
  const sg = (mat.extensions && mat.extensions.KHR_materials_pbrSpecularGlossiness) || {};
  const tx = sg.diffuseTexture || pbr.baseColorTexture;
  let t = null;
  if (tx) {
    const img = j.images[j.textures[tx.index].source];
    const s = sharp(Buffer.from(model.views[img.bufferView]));
    const meta = await s.metadata();
    const w = Math.min(1024, meta.width), h = Math.min(1024, meta.height);
    const { data, info } = await s.resize(w, h).blur(0.8).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    t = { data, w: info.width, h: info.height };
  }
  const f = sg.diffuseFactor || pbr.baseColorFactor || [1, 1, 1, 1];
  tex.set(mi, { t, f });
  return tex.get(mi);
}
let COLS = null;
async function colourOf(v, mi, t0 = -1) {
  // A model with no paint of its own is painted by where each face is (K.paint).
  if (K.paint && t0 >= 0) {
    const c = [0, 1, 2].map((k) => (P[model.T[t0 * 3] * 3 + k] + P[model.T[t0 * 3 + 1] * 3 + k] + P[model.T[t0 * 3 + 2] * 3 + k]) / 3);
    return K.paint({ c, p: [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], o: centroid(P0, t0), q: [P0[v * 3], P0[v * 3 + 1], P0[v * 3 + 2]],
      t: t0, piece: PIECE[t0], own: j.nodes[model.L[t0]].name || '' });
  }
  const { t, f } = await texture(mi);
  // A model painted in someone else's colours is repainted in hers (K.recolour).
  // Whether the point is nearer the bottom of her than the top, looking
  // straight down through her where it is: under her wing, her belly and the
  // lower half of her sides.
  let low = false;
  if (K.recolour) {
    if (!COLS) {
      COLS = new Map();
      for (let t = 0; t < nt; t++) {
        if (PIECE[t] !== 'body') continue;
        for (let k = 0; k < 3; k++) {
          const q = model.T[t * 3 + k];
          const key = `${Math.round(P[q * 3] / 0.1)},${Math.round(P[q * 3 + 2] / 0.1)}`;
          const c = COLS.get(key);
          if (!c) COLS.set(key, [P[q * 3 + 1], P[q * 3 + 1]]);
          else { c[0] = Math.min(c[0], P[q * 3 + 1]); c[1] = Math.max(c[1], P[q * 3 + 1]); }
        }
      }
    }
    const c = COLS.get(`${Math.round(P[v * 3] / 0.1)},${Math.round(P[v * 3 + 2] / 0.1)}`);
    low = !!c && c[1] - c[0] > 0.015 && P[v * 3 + 1] - c[0] < c[1] - P[v * 3 + 1];
  }
  const ny = model.NY[v] || 0;
  const at = { p: [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], ny, low, piece: t0 >= 0 ? PIECE[t0] : null };
  const re = K.recolour && !process.env.NORECOLOUR ? (c) => K.recolour(c, at) : (c) => c;
  if (!t) return re([f[0], f[1], f[2]]);
  const u = ((UV[v * 2] % 1) + 1) % 1, w = ((UV[v * 2 + 1] % 1) + 1) % 1;
  const x = Math.min(t.w - 1, Math.floor(u * t.w)), y = Math.min(t.h - 1, Math.floor(w * t.h));
  const o = (y * t.w + x) * 3;
  return re([t.data[o] / 255 * f[0], t.data[o + 1] / 255 * f[1], t.data[o + 2] / 255 * f[2]]);
}

/**
 * One piece: its faces, each point coloured, points that are the same point
 * welded, decimated to `keep` of its faces, in her frame and moved so `about`
 * (in her frame) is its origin.
 */
async function piece(which, keep, about = [0, 0, 0]) {
  const key = new Map();
  const pos = [], col = [], cn = [], idx = [], uvs = [];
  // A kind drawn with her own texture (`texture`) keeps each point's place on
  // it: two corners that stand together but sit either side of a seam in the
  // texture stay two points.
  const tx = !!K.texture || !!(ATLAS && K.atlas.pieces.includes(which));
  for (let t = 0; t < nt; t++) {
    if (PIECE[t] !== which) continue;
    for (let k = 0; k < 3; k++) {
      const v = model.T[t * 3 + k];
      const uv = !tx ? null : ATLAS ? ATLAS.uvOf(t, v) : [UV[v * 2], UV[v * 2 + 1]];
      const c = await colourOf(v, model.M[t], t);
      const p = toHer(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      // A repainted model keeps its upper and lower skins' points apart where
      // they meet, so the two colours are not run together along the edge.
      const id = p.map((x) => Math.round(x * 1e4)).join(',') + (K.recolour ? (model.NY[v] > 0 ? '+' : '-') : '')
        + (tx ? `@${Math.round(uv[0] * 65536)},${Math.round(uv[1] * 65536)}` : '');
      let n = key.get(id);
      if (n === undefined) {
        n = pos.length / 3;
        key.set(id, n);
        pos.push(p[0] - about[0], p[1] - about[1], p[2] - about[2]);
        col.push(0, 0, 0);
        cn.push(0);
        if (tx) uvs.push(uv[0], uv[1]);
      }
      col[n * 3] += c[0]; col[n * 3 + 1] += c[1]; col[n * 3 + 2] += c[2]; cn[n]++;
      idx.push(n);
    }
  }
  for (let i = 0; i < cn.length; i++) for (let c = 0; c < 3; c++) col[i * 3 + c] /= cn[i];
  let out = Uint32Array.from(idx);
  if (keep < 1 && idx.length) {
    const target = Math.floor((idx.length / 3) * keep) * 3;
    if (tx) {
      // Her texture carries her paint: the decimation keeps her shape and the
      // run of her texture over it, and lets the corners' baked colour go.
      const attr = new Float32Array(cn.length * 2);
      for (let i = 0; i < cn.length; i++) { attr[i * 2] = uvs[i * 2]; attr[i * 2 + 1] = uvs[i * 2 + 1]; }
      [out] = MeshoptSimplifier.simplifyWithAttributes(out, Float32Array.from(pos), 3, attr, 2,
        [K.uvWeight ?? 4, K.uvWeight ?? 4], null, target, 0.02, []);
    } else {
      const attr = Float32Array.from(col);
      [out] = MeshoptSimplifier.simplifyWithAttributes(out, Float32Array.from(pos), 3, attr, 3,
        [0.6, 0.6, 0.6], null, target, 0.02, []);
    }
  }
  const m = creased(pos, col, out, tx ? uvs : null);
  console.log(`  ${which}: ${idx.length / 3} -> ${m.T.length / 3} faces`);
  return m;
}

/** Normals that keep a crease sharper than fifty degrees, and are smooth across anything gentler. */
const CREASE = Math.cos((50 * Math.PI) / 180);
function creased(pos, col, idx, uvs = null) {
  const nf = idx.length / 3;
  const fn = new Float64Array(nf * 3);
  const spot = new Map();
  const at = (v) => {
    if (!uvs) return v;
    const k = `${Math.round(pos[v * 3] * 1e4)},${Math.round(pos[v * 3 + 1] * 1e4)},${Math.round(pos[v * 3 + 2] * 1e4)}`;
    let s = spot.get(k);
    if (s === undefined) spot.set(k, s = v);
    return s;
  };
  const round = new Map();
  for (let f = 0; f < nf; f++) {
    const a = idx[f * 3] * 3, b = idx[f * 3 + 1] * 3, c = idx[f * 3 + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    fn[f * 3] = uy * vz - uz * vy; fn[f * 3 + 1] = uz * vx - ux * vz; fn[f * 3 + 2] = ux * vy - uy * vx;
    for (let k = 0; k < 3; k++) {
      // Smoothed round each point where it stands, not round each corner
      // index: a seam in her texture is no crease in her skin.
      const v = at(idx[f * 3 + k]);
      let r = round.get(v);
      if (!r) round.set(v, r = []);
      r.push(f);
    }
  }
  const unit = (f) => {
    const l = hyp(fn[f * 3], fn[f * 3 + 1], fn[f * 3 + 2]) || 1;
    return [fn[f * 3] / l, fn[f * 3 + 1] / l, fn[f * 3 + 2] / l];
  };
  const m = { P: [], N: [], C: [], T: [], UV: uvs ? [] : null };
  const made = new Map();
  for (let f = 0; f < nf; f++) {
    const me = unit(f);
    for (let k = 0; k < 3; k++) {
      const v = idx[f * 3 + k];
      let nx = 0, ny = 0, nz = 0;
      for (const g of round.get(at(v))) {
        const u = unit(g);
        if (u[0] * me[0] + u[1] * me[1] + u[2] * me[2] < CREASE) continue;
        nx += fn[g * 3]; ny += fn[g * 3 + 1]; nz += fn[g * 3 + 2];
      }
      const l = hyp(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      const key = `${v},${Math.round(nx * 20)},${Math.round(ny * 20)},${Math.round(nz * 20)}`;
      let n = made.get(key);
      if (n === undefined) {
        n = m.P.length / 3;
        made.set(key, n);
        m.P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        m.N.push(nx, ny, nz);
        m.C.push(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]);
        if (uvs) m.UV.push(uvs[v * 2], uvs[v * 2 + 1]);
      }
      m.T.push(n);
    }
  }
  return m;
}

const toByte = (x) => Math.max(0, Math.min(255, Math.round(x * 255)));
// A piece drawn with her texture carries its place on it instead of a colour.
const packed = (m) => packPieceCompact(m, m.UV ? null : (i) => [toByte(m.C[i * 3]), toByte(m.C[i * 3 + 1]), toByte(m.C[i * 3 + 2])]).toString('base64');
const extent = (m) => {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.P.length; i += 3) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], m.P[i + c]); hi[c] = Math.max(hi[c], m.P[i + c]); }
  return [lo, hi];
};

// ---- her own texture, painted here (`atlas`) ------------------------------
// A bare model is given a texture of her paint rather than a colour at each
// corner: every face is laid flat on the tile of the way it looks -- down on
// her from above, up at her from below, at her side, at her nose -- and each
// tile painted texel by texel off where on her it is (`atlas.paint`). Her
// markings are drawn by the texture, round and sharp, whatever size her
// faces happen to be. A tile can be split further by where on her a face is
// (`atlas.layer`): her upper wing's top from her lower wing's, under it.
let ATLAS = null;
if (K.atlas) {
  const A = K.atlas;
  const tiles = new Map();
  const FACE_TILE = new Array(nt);
  const proj = (axis, q) => (axis === 0 ? [q[2], q[1]] : axis === 1 ? [q[0], q[2]] : [q[0], q[1]]);
  // Which way each face looks, off her surface's normal where it stands --
  // the faces' own normals welded and smoothed round every point -- and then
  // each face put with the most of those round it, a few times over: a
  // sculpted skin's faces lean every way, and laid each by its own lean they
  // break her texture into thousands of islands with a seam round each.
  const wid = new Int32Array(P0.length / 3);
  {
    const at = new Map();
    for (let v = 0; v < wid.length; v++) {
      const k = `${Math.round(P0[v * 3] * 1e5)},${Math.round(P0[v * 3 + 1] * 1e5)},${Math.round(P0[v * 3 + 2] * 1e5)}`;
      let i = at.get(k);
      if (i === undefined) at.set(k, i = at.size);
      wid[v] = i;
    }
  }
  const nw = wid.reduce((m, v) => Math.max(m, v), 0) + 1;
  const VN = new Float64Array(nw * 3);
  const FN = new Float64Array(nt * 3);
  for (let t = 0; t < nt; t++) {
    const a = model.T[t * 3] * 3, b = model.T[t * 3 + 1] * 3, c = model.T[t * 3 + 2] * 3;
    const ux = P0[b] - P0[a], uy = P0[b + 1] - P0[a + 1], uz = P0[b + 2] - P0[a + 2];
    const vx = P0[c] - P0[a], vy = P0[c + 1] - P0[a + 1], vz = P0[c + 2] - P0[a + 2];
    FN[t * 3] = uy * vz - uz * vy; FN[t * 3 + 1] = uz * vx - ux * vz; FN[t * 3 + 2] = ux * vy - uy * vx;
    for (let k = 0; k < 3; k++) { const w = wid[model.T[t * 3 + k]]; for (let q = 0; q < 3; q++) VN[w * 3 + q] += FN[t * 3 + q]; }
  }
  const label = new Int8Array(nt).fill(-1);
  const labelOf = (n) => {
    const axis = Math.abs(n[0]) >= Math.abs(n[1]) && Math.abs(n[0]) >= Math.abs(n[2]) ? 0 : Math.abs(n[1]) >= Math.abs(n[2]) ? 1 : 2;
    return axis * 2 + (n[axis] >= 0 ? 1 : 0);
  };
  for (let t = 0; t < nt; t++) {
    if (!A.pieces.includes(PIECE[t])) continue;
    const n = [0, 0, 0];
    for (let k = 0; k < 3; k++) { const w = wid[model.T[t * 3 + k]]; const l = Math.hypot(VN[w * 3], VN[w * 3 + 1], VN[w * 3 + 2]) || 1; for (let q = 0; q < 3; q++) n[q] += VN[w * 3 + q] / l; }
    label[t] = labelOf(n);
  }
  // Faces round each point, for the vote.
  const start = new Int32Array(nw + 1);
  for (let t = 0; t < nt; t++) if (label[t] >= 0) for (let k = 0; k < 3; k++) start[wid[model.T[t * 3 + k]] + 1]++;
  for (let i = 0; i < nw; i++) start[i + 1] += start[i];
  const fill = start.slice(0, nw);
  const round = new Int32Array(start[nw]);
  for (let t = 0; t < nt; t++) if (label[t] >= 0) for (let k = 0; k < 3; k++) round[fill[wid[model.T[t * 3 + k]]]++] = t;
  for (let pass = 0; pass < (A.smooth ?? 3); pass++) {
    const next = label.slice();
    const votes = new Int32Array(6);
    for (let t = 0; t < nt; t++) {
      if (label[t] < 0) continue;
      votes.fill(0);
      for (let k = 0; k < 3; k++) {
        const w = wid[model.T[t * 3 + k]];
        for (let i = start[w]; i < start[w + 1]; i++) if (PIECE[round[i]] === PIECE[t]) votes[label[round[i]]]++;
      }
      let best = label[t];
      for (let q = 0; q < 6; q++) if (votes[q] > votes[best]) best = q;
      next[t] = best;
    }
    label.set(next);
  }
  for (let t = 0; t < nt; t++) {
    if (label[t] < 0) continue;
    const a = model.T[t * 3] * 3, b = model.T[t * 3 + 1] * 3, c = model.T[t * 3 + 2] * 3;
    const axis = label[t] >> 1;
    const sign = label[t] & 1 ? 1 : -1;
    const o = centroid(P0, t);
    const key = `${PIECE[t]}|${axis}|${sign}|${A.layer({ o, axis, sign, piece: PIECE[t] })}`;
    let tl = tiles.get(key);
    if (!tl) tiles.set(key, tl = { key, piece: PIECE[t], axis, sign, layer: key.split('|')[3], lo: [Infinity, Infinity], hi: [-Infinity, -Infinity] });
    for (const v of [a, b, c]) {
      const [pa, pb] = proj(axis, [P0[v], P0[v + 1], P0[v + 2]]);
      tl.lo[0] = Math.min(tl.lo[0], pa); tl.lo[1] = Math.min(tl.lo[1], pb);
      tl.hi[0] = Math.max(tl.hi[0], pa); tl.hi[1] = Math.max(tl.hi[1], pb);
    }
    FACE_TILE[t] = tl;
  }
  // Packed in shelves, tallest first, at one density over all of them, with
  // a margin round each so that nothing bleeds into its neighbour as it is
  // filtered down.
  const SIZE = A.size, PAD = 6;
  const list = [...tiles.values()].sort((p, q) => (q.hi[1] - q.lo[1]) - (p.hi[1] - p.lo[1]));
  const fits = (d) => {
    let x = 0, y = 0, row = 0;
    for (const tl of list) {
      const w = Math.ceil((tl.hi[0] - tl.lo[0]) * d) + PAD * 2, h = Math.ceil((tl.hi[1] - tl.lo[1]) * d) + PAD * 2;
      if (w > SIZE) return false;
      if (x + w > SIZE) { x = 0; y += row; row = 0; }
      tl.px = x; tl.py = y; tl.pw = w; tl.ph = h;
      x += w; row = Math.max(row, h);
    }
    return y + row <= SIZE;
  };
  let d = 4096;
  while (!fits(d)) d *= 0.97;
  const img = Buffer.alloc(SIZE * SIZE * 3, 0);
  for (const tl of list) {
    for (let py = 0; py < tl.ph; py++) {
      for (let px = 0; px < tl.pw; px++) {
        const a = tl.lo[0] + (px + 0.5 - PAD) / d, b = tl.lo[1] + (py + 0.5 - PAD) / d;
        const c = A.paint({ piece: tl.piece, axis: tl.axis, sign: tl.sign, layer: tl.layer, a, b });
        const o = ((tl.py + py) * SIZE + tl.px + px) * 3;
        img[o] = Math.round(Math.min(1, Math.max(0, c[0])) * 255);
        img[o + 1] = Math.round(Math.min(1, Math.max(0, c[1])) * 255);
        img[o + 2] = Math.round(Math.min(1, Math.max(0, c[2])) * 255);
      }
    }
  }
  const uvOf = (t, v) => {
    const tl = FACE_TILE[t];
    const [pa, pb] = proj(tl.axis, [P0[v * 3], P0[v * 3 + 1], P0[v * 3 + 2]]);
    return [(tl.px + PAD + (pa - tl.lo[0]) * d) / SIZE, (tl.py + PAD + (pb - tl.lo[1]) * d) / SIZE];
  };
  const jpg = await sharp(img, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer();
  if (process.env.ATLAS) writeFileSync(process.env.ATLAS, jpg);
  ATLAS = { uvOf, FACE_TILE, jpg };
  console.log(`atlas: ${tiles.size} tiles at ${(d / S).toFixed(1)} texels a metre, ${(jpg.length / 1024).toFixed(0)} KB`);
}

console.log('pieces:');
const PIECES = {};
const DUMPS = {};
const body = await piece('body', K.keep);
DUMPS.body = { m: body };
PIECES.body = packed(body);
if (PIECE.includes('glass')) { const m = await piece('glass', 0.8); DUMPS.glass = { m }; PIECES.glass = packed(m); }
if (PIECE.includes('gear')) { const m = await piece('gear', Math.min(1, K.keep * 1.4)); DUMPS.gear = { m }; PIECES.gear = packed(m); }
// Whatever she carries that leaves her -- a torpedo slung under her -- each
// about its own middle, and where that is.
const STORES = {};
for (const name of K.stores || []) {
  const [slo, shi] = box((t) => PIECE[t] === name);
  const mid = toHer(...[0, 1, 2].map((c) => (slo[c] + shi[c]) / 2));
  const m = await piece(name, Math.min(1, K.storeKeep ?? K.keep * 1.5), mid);
  PIECES[name] = packed(m);
  DUMPS[name] = { m, at: mid };
  STORES[name] = mid.map((v) => +v.toFixed(3));
}
const SPINS = [];
for (let i = 0; i < K.spins.length; i++) {
  const s = K.spins[i];
  const hub = toHer(...s.hub);
  const m = await piece(`spin${i}`, Math.min(1, K.keep * 1.5), hub);
  let r = 0;
  for (let q = 0; q < m.P.length; q += 3) {
    const [x, y, z] = [m.P[q], m.P[q + 1], m.P[q + 2]];
    r = Math.max(r, s.axis === 'y' ? hyp(x, z) : s.axis === 'x' ? hyp(y, z) : hyp(x, y));
  }
  PIECES[s.name] = packed(m);
  DUMPS[s.name] = { m, at: hub };
  SPINS.push({ name: s.name, hub: hub.map((v) => +v.toFixed(3)), axis: s.axis, r: +r.toFixed(2) });
}
// Each textured piece's place on her texture, a pair a point: in sixteen
// bits where it all lies on the one sheet, as glTF draws it, and in floats
// where it repeats.
for (const [k, d] of Object.entries(DUMPS)) {
  if (!d.m.UV) continue;
  const inside = d.m.UV.every((v) => v >= 0 && v <= 1);
  PIECES[`${k}UV`] = inside
    ? `u16:${Buffer.from(Uint16Array.from(d.m.UV, (v) => Math.round(v * 65535)).buffer).toString('base64')}`
    : `f32:${Buffer.from(Float32Array.from(d.m.UV).buffer).toString('base64')}`;
}
// And the texture itself, as a JPEG, for the kinds drawn with it.
let TEXTURE = ATLAS ? `data:image/jpeg;base64,${ATLAS.jpg.toString('base64')}` : null;
if (K.texture) {
  const mat = j.materials[0] || {};
  const img = j.images[j.textures[mat.pbrMetallicRoughness.baseColorTexture.index].source];
  const jpg = await sharp(Buffer.from(model.views[img.bufferView])).resize(K.texture, K.texture)
    .jpeg({ quality: 88, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer();
  TEXTURE = `data:image/jpeg;base64,${jpg.toString('base64')}`;
  console.log(`  texture: ${K.texture}px, ${(jpg.length / 1024).toFixed(0)} KB`);
}
const [blo, bhi] = extent(body);
const r3 = (a) => a.map((v) => Math.round(v * 1000) / 1000);
const META = {
  span: +(bhi[0] - blo[0]).toFixed(2),
  length: +(bhi[2] - blo[2]).toFixed(2),
  height: +(bhi[1] - blo[1]).toFixed(2),
  spins: SPINS,
  ...(Object.keys(STORES).length ? { stores: STORES } : {}),
  // Where her contrails come off her: her wingtips, aft.
  tips: [[r3([blo[0] + 0.3, (blo[1] + bhi[1]) / 2, 0])[0], +((blo[1] + bhi[1]) / 2).toFixed(2), 0],
    [r3([bhi[0] - 0.3])[0], +((blo[1] + bhi[1]) / 2).toFixed(2), 0]],
  // What she fires forward from: her nose.
  guns: K.guns || [[0, +((blo[1] + bhi[1]) / 2).toFixed(2), +(bhi[2] - 0.4).toFixed(2)]],
};
const NAME = KIND.toUpperCase();
const lines = [
  `// Generated by build/naval-air-source.mjs from ${K.src}.`,
  '// Do not hand-edit -- regenerate from the source asset instead.',
  `export const ${NAME}_PIECES = ${JSON.stringify(PIECES)};`,
  `export const ${NAME}_META = ${JSON.stringify(META)};`,
  ...(TEXTURE ? [`export const ${NAME}_TEXTURE = ${JSON.stringify(TEXTURE)};`] : []),
  '',
];
writeFileSync(OUT, lines.join('\n'));
// DUMP=file.glb: every piece, in place, as one coloured mesh to look at.
if (process.env.DUMP) {
  const Pd = [], Nd = [], Cd = [], Td = [], Ud = [];
  const add = (m, at = [0, 0, 0]) => {
    const base = Pd.length / 3;
    for (let i = 0; i < m.P.length; i += 3) { Pd.push(m.P[i] + at[0], m.P[i + 1] + at[1], m.P[i + 2] + at[2]); Nd.push(m.N[i], m.N[i + 1], m.N[i + 2]); Cd.push(m.C[i], m.C[i + 1], m.C[i + 2]); Ud.push(m.UV ? m.UV[(i / 3) * 2] : 0, m.UV ? m.UV[(i / 3) * 2 + 1] : 0); }
    for (const v of m.T) Td.push(base + v);
  };
  for (const [k, m] of Object.entries(DUMPS)) add(m.m, m.at);
  const f32 = (a) => Buffer.from(Float32Array.from(a).buffer);
  const jpg = TEXTURE ? Buffer.from(TEXTURE.split(',')[1], 'base64') : null;
  const pad4 = (b) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
  const bufs = [f32(Pd), f32(Nd), f32(Cd), Buffer.from(Uint32Array.from(Td).buffer), f32(Ud), ...(jpg ? [pad4(jpg)] : [])];
  let off = 0;
  const views = bufs.map((b) => { const v = { buffer: 0, byteOffset: off, byteLength: b.length }; off += b.length; return v; });
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < Pd.length; i++) { mn[i % 3] = Math.min(mn[i % 3], Pd[i]); mx[i % 3] = Math.max(mx[i % 3], Pd[i]); }
  const js = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, ...(jpg ? { TEXCOORD_0: 4 } : { COLOR_0: 2 }) }, indices: 3, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.8, ...(jpg ? { baseColorTexture: { index: 0 } } : {}) }, doubleSided: true }],
    ...(jpg ? { textures: [{ source: 0 }], images: [{ bufferView: 5, mimeType: 'image/jpeg' }] } : {}),
    buffers: [{ byteLength: off }], bufferViews: views,
    accessors: [{ bufferView: 0, componentType: 5126, count: Pd.length / 3, type: 'VEC3', min: mn, max: mx },
      { bufferView: 1, componentType: 5126, count: Pd.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: Pd.length / 3, type: 'VEC3' },
      { bufferView: 3, componentType: 5125, count: Td.length, type: 'SCALAR' },
      { bufferView: 4, componentType: 5126, count: Pd.length / 3, type: 'VEC2' }] }));
  const jsPad = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const bodyB = Buffer.concat(bufs);
  const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jsPad.length + 8 + bodyB.length, 8);
  const c1 = Buffer.alloc(8); c1.writeUInt32LE(jsPad.length, 0); c1.writeUInt32LE(0x4e4f534a, 4);
  const c2 = Buffer.alloc(8); c2.writeUInt32LE(bodyB.length, 0); c2.writeUInt32LE(0x004e4942, 4);
  writeFileSync(process.env.DUMP, Buffer.concat([head, c1, jsPad, c2, bodyB]));
}
console.log(`wrote ${path.relative(ROOT, OUT)}: ${(lines.join('\n').length / 1024).toFixed(0)} KB`, JSON.stringify(META));
