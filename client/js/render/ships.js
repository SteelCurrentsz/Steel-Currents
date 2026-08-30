// Procedural low-poly warships. Every hull is generated from its class data, so
// a Fletcher really is a third the length of an Iowa and the turrets sit where
// the simulation says they do.

import * as THREE from '../../../vendor/three.module.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { buildEnterprise } from './enterprise.js';

const PALETTE = {
  hull: 0x8e969d,
  hullDark: 0x767e85,
  deck: 0x6f767d,
  boot: 0x2b3138,
  antifoul: 0x7c2c23,
  super: 0x9aa2a9,
  turret: 0x8b9299,
  turretTop: 0x40454b,
  barrel: 0x5e646a,
  funnel: 0x7a8188,
  funnelCap: 0x2c3035,
  mast: 0x585e64,
  flightDeck: 0x676d73,
  stripe: 0xd9dde0,
  plane: 0x2f4d7a,
  wood: 0x8a7a5f,
};

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color, flatShading: true, roughness: opts.roughness ?? 0.78,
    metalness: opts.metalness ?? 0.08, ...opts.extra,
  });
}

const MATS = {};
function sharedMat(key, color, opts) {
  if (!MATS[key]) MATS[key] = mat(color, opts);
  return MATS[key];
}

/** Half-beam at normalised station t (-1 stern .. +1 bow). */
function halfBeamAt(t, beam, type) {
  const b = beam * 0.5;
  if (t >= 0) {
    // Fine entry forward; carriers and battleships carry their beam further aft.
    const start = type === 'CV' ? 0.62 : 0.42;
    if (t <= start) return b;
    const k = (t - start) / (1 - start);
    return b * Math.max(0.04, 1 - Math.pow(k, 1.7));
  }
  const a = -t;
  if (a <= 0.72) return b * (1 - 0.06 * a);
  const k = (a - 0.72) / 0.28;
  return b * (0.94 - 0.42 * Math.pow(k, 1.4));
}

/**
 * Builds the hull as three stacked strips: antifouling below the waterline, the
 * boot topping stripe at it, and painted freeboard above.
 */
function buildHull(cls) {
  const { length: L, beam: B, draft: D } = cls.hull;
  const type = cls.type;
  const freeboard = type === 'DD' ? 5.5 : type === 'CV' ? 12 : 8.5 + B * 0.08;
  const stations = 34;
  const group = new THREE.Group();

  const rings = [];
  for (let i = 0; i <= stations; i++) {
    const t = -1 + (2 * i) / stations;
    const z = (t * L) / 2;
    const w = halfBeamAt(t, B, type);
    // Sheer: the deck rises toward the bow, as on any real hull.
    const sheer = freeboard + Math.pow(Math.max(0, t), 2) * (type === 'CV' ? 0.6 : 2.4);
    const keelRise = Math.pow(Math.abs(t), 3.2) * D * 0.85;
    rings.push({ z, w, deckY: sheer, keelY: -D + keelRise, keelW: Math.max(0.5, w * 0.22) });
  }

  const build = (yTop, yBot, wTopKey, wBotKey, color, key) => {
    const pos = [];
    for (let i = 0; i < stations; i++) {
      const a = rings[i], b = rings[i + 1];
      for (const side of [1, -1]) {
        const ax = a[wTopKey] * side, bx = b[wTopKey] * side;
        const ax2 = a[wBotKey] * side, bx2 = b[wBotKey] * side;
        const ay = yTop(a), by = yTop(b), ay2 = yBot(a), by2 = yBot(b);
        if (side === 1) {
          pos.push(ax, ay, a.z, ax2, ay2, a.z, bx2, by2, b.z);
          pos.push(ax, ay, a.z, bx2, by2, b.z, bx, by, b.z);
        } else {
          pos.push(ax, ay, a.z, bx2, by2, b.z, ax2, ay2, a.z);
          pos.push(ax, ay, a.z, bx, by, b.z, bx2, by2, b.z);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, sharedMat(key + cls.id, color));
  };

  // Freeboard, boot topping and underwater body.
  group.add(build((r) => r.deckY, () => 0.9, 'w', 'w', PALETTE.hull, 'hull'));
  group.add(build(() => 0.9, () => -0.9, 'w', 'w', PALETTE.boot, 'boot'));
  group.add(build(() => -0.9, (r) => r.keelY, 'w', 'keelW', PALETTE.antifoul, 'anti'));

  // Deck plating.
  const deckPos = [];
  for (let i = 0; i < stations; i++) {
    const a = rings[i], b = rings[i + 1];
    deckPos.push(-a.w, a.deckY, a.z, a.w, a.deckY, a.z, b.w, b.deckY, b.z);
    deckPos.push(-a.w, a.deckY, a.z, b.w, b.deckY, b.z, -b.w, b.deckY, b.z);
  }
  const deckGeo = new THREE.BufferGeometry();
  deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(deckPos, 3));
  deckGeo.computeVertexNormals();
  group.add(new THREE.Mesh(deckGeo, sharedMat('deck' + cls.id, PALETTE.deck)));

  return { group, freeboard, rings };
}

function box(w, h, d, color, key) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), sharedMat(key, color));
}

function cyl(rt, rb, h, color, key, seg = 10) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), sharedMat(key, color));
}

/** One rotating main-battery turret with its barrels. */
function buildTurret(cls, spec, deckY) {
  const cal = cls.gun.caliber / 1000;
  // A 16-inch triple sits on an 11 m barbette; a 5-inch twin on about 3 m.
  const scale = Math.max(0.8, cal * 9);
  const g = new THREE.Group();
  const barbette = cyl(scale * 1.5, scale * 1.6, 1.6, PALETTE.turret, 'bar' + cls.id, 12);
  barbette.position.y = 0.8;
  g.add(barbette);

  const face = box(scale * 2.7, scale * 1.7, scale * 3.4, PALETTE.turret, 'tur' + cls.id);
  face.position.y = 1.6 + scale * 0.85;
  g.add(face);
  const roof = box(scale * 2.5, 0.35, scale * 3.1, PALETTE.turretTop, 'turt' + cls.id);
  roof.position.y = 1.6 + scale * 1.7;
  g.add(roof);

  const barrelLen = cal * 47;
  for (let i = 0; i < spec.guns; i++) {
    const off = (i - (spec.guns - 1) / 2) * scale * 0.95;
    const b = cyl(cal * 0.85, cal * 1.05, barrelLen, PALETTE.barrel, 'brl' + cls.id, 8);
    b.rotation.x = Math.PI / 2;
    b.position.set(off, 1.6 + scale * 0.85, scale * 1.7 + barrelLen / 2);
    g.add(b);
    // A hint of muzzle recoil geometry keeps the silhouette from looking like pipes.
    const cap = cyl(cal * 1.0, cal * 1.0, cal * 1.8, PALETTE.turretTop, 'cap' + cls.id, 8);
    cap.rotation.x = Math.PI / 2;
    cap.position.set(off, 1.6 + scale * 0.85, scale * 1.7 + barrelLen - cal);
    g.add(cap);
  }
  g.position.set(spec.x, deckY, spec.z);
  g.rotation.y = spec.angle;
  return g;
}

function addSuperstructure(group, cls, deckY) {
  const { length: L, beam: B } = cls.hull;
  const s = cls.hull.superstructure;
  const type = cls.type;

  if (type === 'CV') {
    // Flight deck first: a slab wider than the hull, then the island to starboard.
    const deck = box(B * 1.12, 1.1, L * 0.97, PALETTE.flightDeck, 'fd' + cls.id);
    deck.position.set(0, deckY + 1.2, L * 0.01);
    group.add(deck);
    const stripe = box(0.9, 0.2, L * 0.72, PALETTE.stripe, 'st' + cls.id);
    stripe.position.set(-B * 0.06, deckY + 1.85, 0);
    group.add(stripe);

    const island = box(B * 0.22, 9, L * 0.16, PALETTE.super, 'isl' + cls.id);
    island.position.set(B * 0.42, deckY + 6.5, L * 0.06);
    group.add(island);
    const bridge = box(B * 0.16, 3.4, L * 0.07, PALETTE.super, 'ibr' + cls.id);
    bridge.position.set(B * 0.42, deckY + 12.4, L * 0.1);
    group.add(bridge);
    const stack = box(B * 0.15, 7, L * 0.05, PALETTE.funnel, 'ifn' + cls.id);
    stack.position.set(B * 0.44, deckY + 12, L * 0.0);
    group.add(stack);
    const mast = cyl(0.25, 0.4, 16, PALETTE.mast, 'imt' + cls.id, 6);
    mast.position.set(B * 0.42, deckY + 20, L * 0.03);
    group.add(mast);

    // Aircraft parked on deck, the detail that makes a carrier read as a carrier.
    for (let i = 0; i < 6; i++) {
      const plane = new THREE.Group();
      const body = box(1.1, 0.9, 8.5, PALETTE.plane, 'pl' + cls.id);
      const wing = box(10.5, 0.4, 1.9, PALETTE.plane, 'pl' + cls.id);
      wing.position.z = 0.6;
      const tail = box(3.4, 0.35, 1.2, PALETTE.plane, 'pl' + cls.id);
      tail.position.z = -3.6;
      plane.add(body, wing, tail);
      plane.position.set(
        (i % 2 === 0 ? -1 : 1) * B * 0.24,
        deckY + 2.3,
        -L * 0.34 + Math.floor(i / 2) * L * 0.16,
      );
      plane.rotation.y = (i % 2 === 0 ? -1 : 1) * 0.22;
      group.add(plane);
    }
    return;
  }

  const superWidth = B * 0.62;
  // Forward superstructure block and bridge tower.
  const fwd = box(superWidth, 6 * s, L * 0.16, PALETTE.super, 'sfw' + cls.id);
  fwd.position.set(0, deckY + 3 * s, L * 0.14);
  group.add(fwd);
  const bridge = box(superWidth * 0.78, 4.5 * s, L * 0.075, PALETTE.super, 'sbr' + cls.id);
  bridge.position.set(0, deckY + 6 * s + 2.2 * s, L * 0.16);
  group.add(bridge);
  const conning = box(superWidth * 0.5, 3.4 * s, L * 0.045, PALETTE.super, 'scn' + cls.id);
  conning.position.set(0, deckY + 10.5 * s + 1.6 * s, L * 0.165);
  group.add(conning);

  // Director on top, then a lattice mast.
  const dir = cyl(1.5 * s, 1.7 * s, 2.2 * s, PALETTE.turretTop, 'dir' + cls.id, 8);
  dir.position.set(0, deckY + 14 * s, L * 0.165);
  group.add(dir);
  const mastH = (type === 'BB' ? 26 : type === 'DD' ? 16 : 20) * (0.7 + s * 0.3);
  const mast = cyl(0.22, 0.5, mastH, PALETTE.mast, 'mst' + cls.id, 6);
  mast.position.set(0, deckY + 14 * s + mastH / 2, L * 0.15);
  group.add(mast);
  const yard = box(B * 0.5, 0.25, 0.25, PALETTE.mast, 'yrd' + cls.id);
  yard.position.set(0, deckY + 14 * s + mastH * 0.78, L * 0.15);
  group.add(yard);
  // Radar array: the aerial that separates a 1944 refit from a 1939 ship.
  const radar = box(B * 0.2, 2.4, 0.3, PALETTE.mast, 'rdr' + cls.id);
  radar.position.set(0, deckY + 14 * s + mastH * 0.95, L * 0.15);
  group.add(radar);

  // Funnels.
  const funnels = type === 'DD' ? 2 : type === 'BB' ? 1 : 2;
  for (let i = 0; i < funnels; i++) {
    const fz = funnels === 1 ? L * 0.02 : L * (0.06 - i * 0.16);
    const fh = 8 * s;
    const f = cyl(B * 0.11, B * 0.13, fh, PALETTE.funnel, 'fnl' + cls.id, 10);
    f.position.set(0, deckY + fh / 2 + 1.5, fz);
    f.rotation.x = -0.05;
    group.add(f);
    const cap = cyl(B * 0.115, B * 0.115, 0.8, PALETTE.funnelCap, 'fcp' + cls.id, 10);
    cap.position.set(0, deckY + fh + 1.6, fz);
    group.add(cap);
  }

  // Aft deckhouse.
  const aft = box(superWidth * 0.85, 4.4 * s, L * 0.12, PALETTE.super, 'saf' + cls.id);
  aft.position.set(0, deckY + 2.2 * s, -L * 0.2);
  group.add(aft);

  // Secondary and AA mounts along the waist.
  const aaCount = type === 'BB' ? 8 : type === 'DD' ? 3 : 6;
  for (let i = 0; i < aaCount; i++) {
    for (const side of [-1, 1]) {
      const m = cyl(1.1, 1.3, 1.6, PALETTE.turretTop, 'aa' + cls.id, 8);
      m.position.set(side * B * 0.38, deckY + 1.2, L * (0.24 - (i / aaCount) * 0.5));
      group.add(m);
      const barrels = box(0.35, 0.35, 3.2, PALETTE.barrel, 'aab' + cls.id);
      barrels.position.set(side * B * 0.38, deckY + 2.1, L * (0.24 - (i / aaCount) * 0.5) + 1.4);
      group.add(barrels);
    }
  }

  // Torpedo tubes on the centreline for the ships that carry them.
  if (cls.torpedoes) {
    for (const m of cls.torpedoes.mounts) {
      const tube = box(2.6, 1.8, 7.5, PALETTE.turretTop, 'tt' + cls.id);
      tube.position.set(m.x, deckY + 1.6, m.z);
      tube.rotation.y = m.angle;
      group.add(tube);
    }
  }
}

function addRailings(group, cls, rings, deckY) {
  const pts = [];
  for (const side of [-1, 1]) {
    for (let i = 1; i < rings.length; i++) {
      const a = rings[i - 1], b = rings[i];
      pts.push(a.w * side, a.deckY + 1.1, a.z, b.w * side, b.deckY + 1.1, b.z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xb9c1c8, transparent: true, opacity: 0.5 }));
  group.add(line);
}

/**
 * @returns {{group: THREE.Group, turrets: THREE.Group[], length:number, beam:number, deckY:number}}
 */
export function buildShip(classId) {
  const cls = SHIP_CLASSES[classId] || SHIP_CLASSES.fletcher;
  // The Big E is modelled rather than generated: a Yorktown's flight deck,
  // island, galleries and catwalks are not a shape a procedural hull can be
  // talked into, and she is the one ship in the game a captain can walk round.
  if (cls.id === 'enterprise') {
    const built = buildEnterprise();
    built.group.userData = {
      classId: cls.id, length: built.length, beam: built.beam, deckY: built.deckY,
    };
    return {
      group: built.group, turrets: built.turrets,
      length: built.length, beam: built.beam, deckY: built.deckY,
    };
  }
  const root = new THREE.Group();
  const { group: hull, freeboard, rings } = buildHull(cls);
  root.add(hull);

  const deckY = freeboard;
  addSuperstructure(root, cls, deckY);
  addRailings(root, cls, rings, deckY);

  const turrets = cls.turrets.map((spec) => {
    const t = buildTurret(cls, spec, cls.type === 'CV' ? deckY + 1.6 : deckY);
    root.add(t);
    return t;
  });

  root.userData = { classId: cls.id, length: cls.hull.length, beam: cls.hull.beam, deckY };
  return { group: root, turrets, length: cls.hull.length, beam: cls.hull.beam, deckY };
}

export { PALETTE };
