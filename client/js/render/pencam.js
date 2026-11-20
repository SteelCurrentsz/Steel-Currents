// The penetration camera.
//
// When one of your rounds strikes a ship the camera goes to her -- her own
// model, where she is in the battle -- and for a couple of seconds her
// plating turns to glass. What is behind it stays solid: her insides where
// her model has them (see interior.js), the rooms at that station, and every
// plate of her armour there, where it really is and as thick as it is (see
// shared/armor.js), picked out in colour. The shell comes in along its own
// line of flight and meets the plates the simulation walked it through, in
// order. If it beat them it goes on into whatever they were protecting and
// bursts there into pieces; if it did not, it breaks up against the plate
// that stopped it, or glances off it and goes away.
//
// It is the battle's own camera and the battle's own ship, not a separate
// screen: she goes on steaming while it runs, and when it is over she turns
// solid again and the camera goes back to wherever it was.

import * as THREE from '../../../vendor/three.module.js';
import { armourScheme, LAYER_NAMES } from '../../../shared/armor.js';
import { freeboardOf } from '../../../shared/sim.js';
import { getClass } from '../../../shared/ships.js';
import { sectionAt, extents, halfAt } from './section.js';
import { isInteriorMaterial } from './interior.js';

const RESULT = {
  citadel: 'CITADEL', pen: 'PENETRATION', overpen: 'OVERPENETRATION', he: 'HIT',
  splash: 'NO PENETRATION', shatter: 'SHATTERED', ricochet: 'RICOCHET',
};

/** The rooms of her at a station, as fractions of her half-length; see damageboard.js. */
const ROOMS = [
  { name: 'Forward magazine', t0: 0.26, t1: 0.5, lo: 0, hi: 0.34 },
  { name: 'Shell room', t0: 0.26, t1: 0.5, lo: 0.34, hi: 0.58 },
  { name: 'Boiler room', t0: 0.02, t1: 0.26, lo: 0, hi: 0.62 },
  { name: 'Engine room', t0: -0.26, t1: 0.02, lo: 0, hi: 0.58 },
  { name: 'After magazine', t0: -0.52, t1: -0.26, lo: 0, hi: 0.34 },
  { name: 'Shell room', t0: -0.52, t1: -0.26, lo: 0.34, hi: 0.58 },
  { name: 'Steering gear', t0: -0.9, t1: -0.72, lo: 0, hi: 0.42 },
];

// How long each part of it runs, in seconds.
const APPROACH = 0.55;
const THROUGH_SPEED = 26;      // metres a second, inside her: slow motion
const AFTER = 1.8;
/** How long after one has been shown before another ship's hit is shown, in seconds. */
const QUIET = 6;
/** How much of her plating is left to see, while she is glass. */
const GLASS = 0.3;
const MAX_BITS = 420;

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Colours of the plates: one it went through, the one that stopped it, and
// one it never met.
const C_HOT = 0xe8c46a;
const C_STOP = 0xff5a3c;
const C_COLD = 0x8e9aa6;
const ROOM_TINT = (name) => (name.includes('magazine') ? 0xc8503a : name.includes('Shell') ? 0xc8963c : 0x5a8caa);

const TMP = new THREE.Vector3();

/** A soft round glow, white at its heart, for the fire of a burst. */
let GLOW = null;
function glow() {
  if (GLOW) return GLOW;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255, 250, 235, 1)');
  g.addColorStop(0.25, 'rgba(255, 210, 140, 0.9)');
  g.addColorStop(0.6, 'rgba(200, 90, 30, 0.45)');
  g.addColorStop(1, 'rgba(60, 30, 20, 0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  GLOW = new THREE.CanvasTexture(c);
  GLOW.colorSpace = THREE.SRGBColorSpace;
  return GLOW;
}
const TMP2 = new THREE.Vector3();

export class PenCam {
  /** `viewOf(id)` hands over the ship's view, whose model the camera goes to. */
  constructor(host, viewOf = null) {
    this.host = host;
    this.viewOf = viewOf;
    // Over the picture: only the words -- what it met and what came of it --
    // and a tap anywhere to come away early.
    this.el = document.createElement('div');
    this.el.className = 'pen-cam';
    this.el.hidden = true;
    this.canvas = document.createElement('canvas');
    this.el.appendChild(this.canvas);
    this.el.addEventListener('pointerdown', () => this.stop());
    host.appendChild(this.el);
    this.ctx = this.canvas.getContext('2d');
    this.shot = null;
    this.pending = null;
  }

  get busy() { return !!this.shot; }

  /**
   * A hit to be shown. Rounds of one salvo land within a fraction of a second
   * of one another, so they are gathered for a moment and the one that did
   * the most is the one shown.
   */
  offer(ev, ours = true) {
    if (this.shot || !ev || !ev.pl) return;
    // Somebody else's round, only when nothing has been shown for a while:
    // a fleet action puts a hit somewhere every second, and cutting away to
    // every one of them is no battle at all.
    if (!ours && (this.quietFor || 0) < QUIET) return;
    const rank = (e) => ({ citadel: 5, pen: 4, overpen: 3, he: 2, shatter: 1, ricochet: 1, splash: 0 }[e.kind] || 0) * 1e6 + (e.dmg || 0);
    if (!this.pending) this.pending = { ev, wait: 0.15 };
    else if (rank(ev) > rank(this.pending.ev)) this.pending.ev = ev;
  }

  stop() {
    const s = this.shot;
    this.shot = null;
    this.el.hidden = true;
    this.quietFor = 0;
    if (!s) return;
    this.solid(s);
    if (s.rig) {
      s.rig.parent?.remove(s.rig);
      s.rig.traverse((o) => {
        o.geometry?.dispose();
        if (o.material && !o.material.shared) o.material.dispose();
      });
    }
    // The battle's camera as it was handed over.
    if (s.cam && s.camWas) {
      s.cam.fov = s.camWas.fov;
      s.cam.near = s.camWas.near;
      s.cam.up.copy(s.camWas.up);
      s.cam.updateProjectionMatrix();
    }
  }

  update(dt) {
    if (!this.shot) this.quietFor = (this.quietFor ?? QUIET) + dt;
    if (this.pending) {
      this.pending.wait -= dt;
      if (this.pending.wait <= 0) {
        const ev = this.pending.ev;
        this.pending = null;
        this.start(ev);
      }
    }
    const s = this.shot;
    if (!s) return;
    // She has gone -- sunk and taken off, or drawn again as something else.
    if (this.viewOf?.(s.ev.victim) !== s.view || !s.view.group.parent) { this.stop(); return; }
    s.t += dt;
    this.step(dt);
    if (s.t > s.end) this.stop();
  }

  start(ev) {
    const cls = getClass(ev.sc);
    const view = this.viewOf?.(ev.victim);
    if (!cls || !view || !view.group) return;
    let S = armourScheme(cls, freeboardOf(cls));
    const half = cls.hull.length / 2;
    const g = view.group;
    g.updateMatrixWorld(true);
    // Where it struck, in her own frame: x across her, y up from her
    // waterline, z along her towards the bow.
    const P = g.worldToLocal(new THREE.Vector3(ev.x ?? 0, ev.y ?? 4, ev.z ?? 0));
    if (!Number.isFinite(P.x) || !Number.isFinite(P.z)) return;
    if (Number.isFinite(ev.lz)) P.z = ev.lz;
    const rel = Math.min(1, Math.abs(P.z) / half);
    // Her half-breadth at this station: full amidships, fining to her ends.
    const fine = rel < 0.5 ? 1 : Math.sqrt(Math.max(0.04, 1 - ((rel - 0.5) / 0.5) ** 2));
    let hb = S.B2 * fine;
    let worksTop = S.fb + 6 + 7 * (cls.hull.superstructure || 1);
    // Her own model cut across at the station it struck, when there is one:
    // her real lines, so the plates follow her side and her deck.
    let ext = null;
    try { const segs = sectionAt(view, P.z); ext = segs && segs.length > 6 ? extents(segs) : null; } catch { ext = null; }
    if (ext) {
      let wide = 0;
      for (let y = -S.draft; y < S.fb * 1.6; y += 0.25) wide = Math.max(wide, halfAt(ext, y) || 0);
      let deckY = 0;
      for (let y = 0; y < S.fb * 2.2; y += 0.25) {
        const h = halfAt(ext, y);
        if (h >= wide * 0.8) deckY = y;
        else if (y > 1.5) break;
      }
      if (deckY > 1) {
        const k = deckY / S.fb;
        S = { ...S, fb: deckY, beltTop: S.beltTop * k, mainDeck: S.mainDeck * k, splinterDeck: S.splinterDeck * k };
      }
      hb = Math.max(1, halfAt(ext, Math.min(S.fb - 0.5, 1)) || hb);
      worksTop = ext.y1;
    }
    const halfY = (y) => (ext ? (halfAt(ext, y) || 0) : (y <= S.fb ? hb : hb * 0.42));
    const side = (P.x || ev.lx || 0) >= 0 ? 1 : -1;
    // Where it struck, held to her: on her deck, her side or her upperworks.
    if (ev.part === 'deck') { P.x = clamp(P.x, -hb * 0.9, hb * 0.9); P.y = S.fb; }
    else if (ev.part !== 'superstructure') {
      P.y = clamp(P.y, -S.draft + 0.5, S.fb - 0.3);
      P.x = side * (halfY(P.y) || hb);
    } else {
      P.y = clamp(P.y, S.fb + 1, worksTop - 1);
    }

    // Its line of flight, in her frame. A round coming down her length is
    // turned a little off it, or it would arrive edge-on to her side.
    let dx = ev.lv?.[0] ?? -side * 600;
    let dy = ev.lv?.[1] ?? -40;
    let dz = ev.lv?.[2] ?? 0;
    if (ev.part !== 'deck' && Math.sign(dx) === side) dx = -dx;
    if (ev.part !== 'deck') {
      const flat = Math.hypot(dx, dz);
      if (Math.abs(dx) < flat * 0.35) dx = -side * flat * 0.35;
    }
    if (ev.part === 'deck' && dy > -1) dy = -Math.max(30, Math.hypot(dx, dz) * 0.6);
    const d = new THREE.Vector3(dx, dy, dz);
    if (d.lengthSq() < 1) d.set(ev.part === 'deck' ? 0 : -side, -0.2, 0);
    d.normalize();

    // Where it meets each plate, as a distance along that line from the first.
    const plates = (ev.pl || []).map(([k, t, eff], i) => {
      let s = 0;
      if (i > 0) {
        if (k === 'k') s = Math.abs((S.B2 * 0.32) / (d.x || 1e-3));
        else if (k === 'd') s = Math.abs((P.y - S.mainDeck) / (d.y || -1e-3));
        else if (k === 's') s = Math.abs((P.y - S.splinterDeck) / (d.y || -1e-3));
        else s = 2 * i;
      }
      return { k, t, eff, s: Math.min(s, hb * 3) };
    });
    const stop = ev.ps ?? -1;
    const kind = ev.kind;
    const last = plates.length ? plates[plates.length - 1].s : 0;
    let burstAt;
    if (kind === 'ricochet' || kind === 'shatter' || kind === 'splash') burstAt = 0;
    else if (stop >= 0) burstAt = plates[Math.min(stop, plates.length - 1)].s;
    else if (kind === 'overpen') burstAt = hb * 2.6;
    else if (kind === 'citadel') burstAt = last + Math.min(hb * 0.7, 7);
    else burstAt = last + 3.2;
    const rooms = ROOMS.filter((r) => {
      const t = P.z / half;
      return t >= Math.min(r.t0, r.t1) && t <= Math.max(r.t0, r.t1);
    });

    const s = {
      ev, cls, S, hb, half, rel, P, d, side, plates, stop, kind, burstAt, rooms, view, halfY,
      t: 0,
      inside: burstAt / THROUGH_SPEED,
      end: APPROACH + burstAt / THROUGH_SPEED + AFTER,
      burst: false, sparked: new Set(), labels: [],
      lead: clamp(hb * 3.4, 30, 70),
    };
    this.shot = s;
    this.build(s);
    this.glass(s);
    this.el.hidden = false;
    this.resize();
  }

  /** Her plating made glass, all but her insides and what this camera put in her. */
  glass(s) {
    const swapped = [];
    const made = new Map();
    const see = (m) => {
      // Her insides stay as they are: they are what the glass is for.
      if (!m || m.isShaderMaterial || m.isRawShaderMaterial || isInteriorMaterial(m)) return m;
      let c = made.get(m);
      if (!c) {
        c = m.clone();
        c.transparent = true;
        c.opacity = Math.min(m.opacity ?? 1, GLASS);
        c.depthWrite = false;
        c.side = THREE.DoubleSide;
        made.set(m, c);
      }
      return c;
    };
    const walk = (o) => {
      if (o === s.rig || o.userData?.inside) return;
      if (o.userData && o.userData.lamp !== undefined) return;
      if ((o.isMesh || o.isInstancedMesh) && o.material) {
        const was = o.material;
        o.material = Array.isArray(was) ? was.map(see) : see(was);
        if (o.material !== was) swapped.push([o, was, o.material]);
      }
      for (const c of o.children) walk(c);
    };
    walk(s.view.group);
    s.swapped = swapped;
    s.glassMats = [...made.values()];
  }

  /** And solid again. */
  solid(s) {
    // Only where nothing has put something else on her since -- a blast
    // charring her, say -- which is hers to keep.
    for (const [o, was, now] of s.swapped || []) if (o.material === now) o.material = was;
    for (const m of s.glassMats || []) m.dispose();
    s.swapped = null;
    s.glassMats = null;
  }

  /**
   * What is put inside her for the camera: her armour at this station, the
   * rooms it protects where her model has no insides of its own, the round
   * and what it throws.
   */
  build(s) {
    const { S, P, hb, halfY } = s;
    const rig = new THREE.Group();
    rig.name = 'penetration camera';
    s.rig = rig;
    s.view.group.add(rig);
    const hasInside = (() => {
      let any = false;
      s.view.group.traverse((o) => { if (o.userData?.inside) any = true; });
      return any;
    })();
    // How far along her the plates are drawn, either side of the station.
    const reach = clamp(hb * 0.5, 3, 8);
    const z0 = P.z;
    const hot = new Set(s.plates.map((p) => p.k));
    const stopK = s.stop >= 0 && s.plates[s.stop] ? s.plates[s.stop].k : null;
    const show = (t) => clamp((t / 1000) * 2.6, 0.1, 1.3);
    const plateMat = (key) => new THREE.MeshBasicMaterial({
      color: key === stopK ? C_STOP : hot.has(key) ? C_HOT : C_COLD,
      transparent: true,
      opacity: key === stopK ? 0.85 : hot.has(key) ? 0.55 : 0.18,
      depthWrite: key === stopK || hot.has(key),
    });
    const slab = (key, t, cx, cy, w, h, len = reach * 2) => {
      if (!(t > 0) || !(w > 0.01) || !(h > 0.01)) return;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, len), plateMat(key));
      m.position.set(cx, cy, z0);
      m.renderOrder = 2;
      rig.add(m);
    };
    const side = (key, t, ya, yb) => {
      if (!(yb > ya)) return;
      const th = show(t);
      for (const sd of [-1, 1]) {
        const x = sd * Math.max(0.5, (halfY((ya + yb) / 2) || hb) - 0.15 - th / 2);
        slab(key, t, x, (ya + yb) / 2, th, yb - ya);
      }
    };
    const deck = (key, t, y, w) => slab(key, t, 0, y, Math.max(0.5, w * 2), show(t));
    const beltKey = S.boxed ? 'b' : 'p';
    side(beltKey, S.belt, S.beltLow, Math.min(S.beltTop, S.fb));
    const inner = Math.max(0.8, S.boxed
      ? (halfY((S.bottom + S.splinterDeck) / 2) || hb) - S.B2 * 0.32
      : (halfY(S.fb * 0.3) || hb) - 0.5);
    if (S.boxed) {
      side('p', S.upper, S.beltTop, S.fb);
      for (const sd of [-1, 1]) slab('k', S.bulkhead, sd * inner, (S.bottom + S.mainDeck) / 2, show(S.bulkhead), S.mainDeck - S.bottom);
      deck('d', S.deck, S.mainDeck, halfY(S.mainDeck) || hb);
      deck('s', S.splinter, S.splinterDeck, inner);
    }
    deck('w', S.weather, S.fb, halfY(S.fb - 0.1) || hb);
    if (s.ev.part === 'bow' || s.ev.part === 'stern') side(s.ev.part === 'bow' ? 'f' : 'a', S.bow, Math.max(-S.draft, -S.draft), S.fb);

    // The rooms at this station, along as much of her as each one runs.
    const roomTop = S.boxed ? S.splinterDeck : S.fb - 2.4;
    const depth = roomTop - S.bottom;
    for (const r of s.rooms) {
      const y0 = S.bottom + r.lo * depth;
      const y1 = S.bottom + r.hi * depth;
      const za = Math.min(r.t0, r.t1) * s.half, zb = Math.max(r.t0, r.t1) * s.half;
      s.labels.push({ text: r.name.toUpperCase(), at: new THREE.Vector3(0, (y0 + y1) / 2, z0) });
      if (hasInside) continue;
      const room = new THREE.Mesh(new THREE.BoxGeometry(inner * 2, y1 - y0, zb - za),
        new THREE.MeshBasicMaterial({ color: ROOM_TINT(r.name), transparent: true, opacity: 0.2, depthWrite: false }));
      room.position.set(0, (y0 + y1) / 2, (za + zb) / 2);
      room.renderOrder = 1;
      rig.add(room);
      this.contents(rig, r.name, inner, y0, y1, za, zb);
    }
    if (!s.rooms.length) {
      s.labels.push({ text: s.rel > 0.74 ? 'STORES' : 'CREW SPACES', at: new THREE.Vector3(0, (S.bottom + roomTop) / 2, z0) });
    }

    // The round: a glowing slug, drawn larger than life so it can be
    // followed, with the streak of its flight behind it.
    const bore = (s.ev.cal || 152) / 1000;
    const len = Math.max(1.4, bore * 6);
    const rad = Math.max(0.2, bore * 1.1);
    const shell = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 10),
      new THREE.MeshBasicMaterial({ color: 0xffe2a8 }));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(rad, len * 0.55, 10),
      new THREE.MeshBasicMaterial({ color: 0xfff2d8 }));
    tip.position.y = len * 0.775;
    const streak = new THREE.Mesh(new THREE.ConeGeometry(rad * 1.6, len * 9, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff9a40, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    streak.rotation.x = Math.PI;
    streak.position.y = -len * 5;
    shell.add(body, tip, streak);
    // Pointed down its line of flight.
    shell.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), s.d);
    shell.renderOrder = 3;
    rig.add(shell);
    s.shell = shell;

    // The fire of the burst.
    const fire = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow(), color: 0xffa040, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
    }));
    fire.visible = false;
    fire.renderOrder = 4;
    rig.add(fire);
    s.fire = { mesh: fire, r: (3 + 4 * (s.kind === 'citadel' ? 1.8 : s.kind === 'overpen' ? 0.4 : 1)) * Math.min(1.6, (s.ev.cal || 152) / 280), age: -1 };

    // The pieces: each a short streak, hot or cold.
    const pos = new Float32Array(MAX_BITS * 6);
    const col = new Float32Array(MAX_BITS * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const bits = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    bits.frustumCulled = false;
    bits.renderOrder = 5;
    rig.add(bits);
    s.bitsMesh = bits;
    s.bits = [];
    this.place(s);
  }

  /**
   * What is in a room, roughly as a builder's model has it: boilers in a
   * boiler room, turbine casings in an engine room, cordite in its cases in a
   * magazine, shells standing in their racks.
   */
  contents(rig, name, inner, y0, y1, za, zb) {
    const h = y1 - y0;
    const w = inner * 2;
    const L = zb - za;
    const mat = new THREE.MeshLambertMaterial({ color: 0x8a96a0, transparent: true, opacity: 0.55, depthWrite: false });
    const add = (geo, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.renderOrder = 1;
      rig.add(m);
      return m;
    };
    if (name === 'Boiler room') {
      const n = w > 18 ? 4 : w > 10 ? 3 : 2;
      const rows = Math.max(1, Math.min(3, Math.round(L / 12)));
      const bw = (w * 0.86) / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < rows; j++) {
        add(new THREE.BoxGeometry(bw * 0.8, h * 0.6, Math.min(8, L / rows * 0.7)),
          -inner + w * 0.07 + (i + 0.5) * bw, y0 + h * 0.38, za + (j + 0.5) * (L / rows));
      }
    } else if (name === 'Engine room') {
      const n = w > 18 ? 4 : 2;
      const bw = (w * 0.86) / n;
      for (let i = 0; i < n; i++) {
        const c = add(new THREE.CylinderGeometry(bw * 0.38, bw * 0.38, L * 0.7, 14),
          -inner + w * 0.07 + (i + 0.5) * bw, y0 + h * 0.36, (za + zb) / 2);
        c.rotation.x = Math.PI / 2;
      }
    } else if (name.includes('magazine') || name === 'Shell room') {
      const cols = Math.max(3, Math.min(8, Math.round(w / 2.4)));
      const rows = Math.max(2, Math.min(6, Math.round(L / 4)));
      const geo = name === 'Shell room'
        ? new THREE.CylinderGeometry(0.3, 0.3, h * 0.6, 8)
        : new THREE.BoxGeometry((w / cols) * 0.6, h * 0.6, (L / rows) * 0.5);
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        add(geo, -inner + (i + 0.5) * (w / cols), y0 + h * 0.4, za + (j + 0.5) * (L / rows));
      }
    } else if (name === 'Steering gear') {
      add(new THREE.BoxGeometry(inner, h * 0.4, Math.min(L * 0.5, 6)), 0, y0 + h * 0.4, (za + zb) / 2);
    }
  }

  // The round's place along its line: before it reaches her, then through
  // her at slow-motion speed.
  along(T) {
    const s = this.shot;
    return T < APPROACH ? -(1 - T / APPROACH) * s.lead : Math.min(s.burstAt, (T - APPROACH) * THROUGH_SPEED);
  }

  /** The round and the fire where they are at this moment. */
  place(s) {
    const a = this.along(s.t);
    if (!s.burst) {
      s.shell.visible = true;
      s.shell.position.copy(s.P).addScaledVector(s.d, a);
    } else if (s.away) {
      const go = (s.t - APPROACH - s.inside) * 30;
      s.shell.position.copy(s.burstPt).addScaledVector(s.away, go);
      s.shell.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), s.away);
      s.shell.visible = go < 60;
    } else {
      s.shell.visible = false;
    }
  }

  spark(at, n, speed, hot = true, life = 0.7, dir = null) {
    const s = this.shot;
    for (let i = 0; i < n && s.bits.length < MAX_BITS; i++) {
      const v = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1));
      if (v.lengthSq() < 1e-4) v.set(0, 1, 0);
      v.normalize();
      if (dir) v.multiplyScalar(0.85).add(dir).normalize();
      v.multiplyScalar(speed * rnd(0.35, 1));
      s.bits.push({ p: at.clone(), v, age: 0, life: life * rnd(0.6, 1.2), hot });
    }
  }

  step(dt) {
    const s = this.shot;
    const T = s.t;
    // Each plate it gets through throws sparks off where it went through.
    s.plates.forEach((p, i) => {
      if (s.sparked.has(i)) return;
      if (T < APPROACH + p.s / THROUGH_SPEED) return;
      if (s.stop >= 0 && i > s.stop) return;
      s.sparked.add(i);
      const at = s.P.clone().addScaledVector(s.d, p.s);
      if (i !== s.stop || s.kind === 'pen') this.spark(at, 18, 22, true, 0.55, s.d.clone().negate());
    });
    if (!s.burst && T >= APPROACH + s.inside) {
      s.burst = true;
      const at = s.P.clone().addScaledVector(s.d, s.burstAt);
      s.burstPt = at;
      if (s.kind === 'ricochet') {
        // Off the face of the plate and away, in pieces.
        const out = s.d.clone();
        if (s.ev.part === 'deck') out.y = -out.y; else out.x = -out.x;
        s.away = out.normalize();
        this.spark(at, 16, 24, true, 0.6, out);
      } else if (s.kind === 'shatter' || s.kind === 'splash') {
        // Broken up on the plate: the pieces go every way but in.
        this.spark(at, 34, 18, true, 0.9, s.d.clone().negate());
        this.spark(at, 14, 9, false, 1.1);
      } else {
        // Burst inside her: fragments every way, and the fire of it.
        const big = s.kind === 'citadel' ? 1.8 : s.kind === 'overpen' ? 0.4 : 1;
        this.spark(at, Math.round(110 * big), 34 * big, true, 1.1);
        this.spark(at, Math.round(45 * big), 16 * big, false, 1.4);
        s.fire.age = 0;
        s.fire.mesh.position.copy(at);
        s.fire.mesh.visible = true;
      }
    }
    // The fire swelling and dying.
    const f = s.fire;
    if (f.age >= 0) {
      f.age += dt;
      const u = Math.min(1, f.age / 1.4);
      f.mesh.scale.setScalar(2 * f.r * (0.4 + 1.2 * Math.sqrt(u)));
      f.mesh.material.opacity = 0.95 * (1 - u * u);
      f.mesh.material.color.setRGB(1, 0.7 + 0.3 * (1 - u), 0.45 + 0.55 * (1 - u));
      f.mesh.visible = u < 1;
    }
    // The pieces.
    const pos = s.bitsMesh.geometry.attributes.position.array;
    const col = s.bitsMesh.geometry.attributes.color.array;
    let n = 0;
    s.bits = s.bits.filter((b) => (b.age += dt) < b.life);
    for (const b of s.bits) {
      b.p.addScaledVector(b.v, dt);
      b.v.y -= 6 * dt;
      b.v.multiplyScalar(Math.exp(-dt * 1.4));
      const a = 1 - b.age / b.life;
      const k = n * 6;
      pos[k] = b.p.x; pos[k + 1] = b.p.y; pos[k + 2] = b.p.z;
      pos[k + 3] = b.p.x - b.v.x * 0.05; pos[k + 4] = b.p.y - b.v.y * 0.05; pos[k + 5] = b.p.z - b.v.z * 0.05;
      const r = b.hot ? a : 0.65 * a, gg = b.hot ? (0.65 + 0.25 * a) * a : 0.68 * a, bb = b.hot ? 0.35 * a : 0.7 * a;
      col[k] = r; col[k + 1] = gg; col[k + 2] = bb;
      col[k + 3] = r * 0.3; col[k + 4] = gg * 0.3; col[k + 5] = bb * 0.3;
      n++;
    }
    s.bitsMesh.geometry.setDrawRange(0, n * 2);
    s.bitsMesh.geometry.attributes.position.needsUpdate = true;
    s.bitsMesh.geometry.attributes.color.needsUpdate = true;
    this.place(s);
  }

  /**
   * The camera, while a hit is being shown: off her quarter on the side the
   * round came in, a little above her, looking across the line it takes
   * through her -- so the plates it meets are side by side on the screen --
   * and drifting slowly round while it runs. True while it has the camera.
   */
  aim(cam) {
    const s = this.shot;
    if (!s) return false;
    if (!s.cam) {
      s.cam = cam;
      s.camWas = { fov: cam.fov, near: cam.near, up: cam.up.clone() };
    }
    const g = s.view.group;
    g.updateMatrixWorld(true);
    // What it looks at: between where the round went in and where it ends.
    const look = s.P.clone().addScaledVector(s.d, Math.min(s.burstAt, s.hb * 1.4) * 0.5);
    const range = clamp(s.hb * 2 * 1.75 + 10, 24, 95);
    const u = clamp(s.t / s.end, 0, 1);
    // Along her from the end of her nearer the hit, round onto her beam on
    // the side it came in from.
    const ends = s.P.z >= 0 ? 1 : -1;
    const az = 0.78 + 0.3 * u;
    const el = 0.36 - 0.06 * u;
    const off = new THREE.Vector3(
      s.side * Math.sin(az) * Math.cos(el),
      Math.sin(el),
      ends * Math.cos(az) * Math.cos(el),
    ).multiplyScalar(range);
    const eye = g.localToWorld(TMP.copy(look).add(off));
    const at = g.localToWorld(TMP2.copy(look));
    eye.y = Math.max(eye.y, 2.5);
    cam.fov = 46;
    cam.near = 0.3;
    cam.updateProjectionMatrix();
    cam.up.set(0, 1, 0);
    cam.position.copy(eye);
    cam.lookAt(at);
    cam.updateMatrixWorld();
    this.draw(cam);
    return true;
  }

  resize() {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
    }
    this.dpr = dpr;
  }

  /** The words over the picture. */
  draw(cam) {
    this.resize();
    const s = this.shot;
    const c = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const dpr = this.dpr;
    c.clearRect(0, 0, W, H);
    const fade = clamp(Math.min(s.t / 0.15, (s.end - s.t) / 0.25), 0, 1);
    c.save();
    c.globalAlpha = fade;
    // A darkened edge, so it reads as a camera of its own.
    const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
    vg.addColorStop(0, 'rgba(4, 10, 18, 0)');
    vg.addColorStop(1, 'rgba(4, 10, 18, 0.6)');
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);

    // The rooms, named where they are in her.
    c.font = `600 ${11 * dpr}px "Inter", system-ui, sans-serif`;
    c.textAlign = 'center';
    const g = s.view.group;
    for (const l of s.labels) {
      const p = g.localToWorld(TMP.copy(l.at)).project(cam);
      if (p.z > 1 || p.z < -1) continue;
      const x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H;
      c.fillStyle = 'rgba(4, 10, 18, 0.55)';
      const tw = c.measureText(l.text).width;
      c.fillRect(x - tw / 2 - 6 * dpr, y - 11 * dpr, tw + 12 * dpr, 16 * dpr);
      c.fillStyle = 'rgba(210, 225, 235, 0.85)';
      c.fillText(l.text, x, y + 1 * dpr);
    }

    // What it met, plate by plate, and what came of it: at the head of the
    // picture, clear of the event log in its corner.
    c.textAlign = 'center';
    c.shadowColor = 'rgba(0, 0, 0, 0.85)';
    c.shadowBlur = 6 * dpr;
    c.font = `600 ${15 * dpr}px "Inter", system-ui, sans-serif`;
    c.fillStyle = '#e6cf9c';
    c.fillText(`${s.ev.cal || ''} mm ${s.ev.ap ? 'AP' : 'HE'} — ${s.cls.name}`, W / 2, 64 * dpr);
    c.font = `${12 * dpr}px "Inter", system-ui, sans-serif`;
    let ly = 86 * dpr;
    s.plates.forEach((p, i) => {
      const reached = s.stop < 0 || i <= s.stop;
      c.fillStyle = i === s.stop && s.kind !== 'pen' ? '#ff6a4c' : i === s.stop ? '#ffb05a' : reached ? '#cfd8e0' : 'rgba(207, 216, 224, 0.4)';
      const what = i === s.stop ? (s.kind === 'ricochet' ? '  glanced off' : s.kind === 'pen' ? '  stopped it, burst' : '  stopped it') : reached ? '  through' : '';
      c.fillText(`${LAYER_NAMES[p.k] || p.k}  ${p.t} mm  (${p.eff} mm at that angle)${what}`, W / 2, ly);
      ly += 18 * dpr;
    });
    if (s.t > APPROACH + s.inside) {
      c.font = `700 ${22 * dpr}px "Inter", system-ui, sans-serif`;
      c.textAlign = 'center';
      c.fillStyle = s.kind === 'citadel' ? '#ff5a3c' : (s.kind === 'pen' || s.kind === 'he' || s.kind === 'overpen') ? '#e6cf9c' : '#cfd8e0';
      c.fillText(`${RESULT[s.kind] || 'HIT'}${s.ev.dmg ? `  ${s.ev.dmg.toLocaleString()}` : ''}`, W / 2, H - 128 * dpr);
    }
    c.font = `${10 * dpr}px "Inter", system-ui, sans-serif`;
    c.textAlign = 'right';
    c.fillStyle = 'rgba(207, 216, 224, 0.55)';
    c.fillText('TAP TO SKIP', W - 20 * dpr, H - 18 * dpr);
    c.restore();
  }
}
