// The damage board: her own ship, stood in the air over the panel, with the
// sea in her, the fires in her and the holes they came through drawn on her.
//
// It is the one place the state of the ship is read now that there is no bar to
// read it off. A hull is not a number that runs down -- she is compartments,
// and what a damage control officer wants to know is which of them are open to
// the sea, where the water is getting in, how far up it has come, and what is
// burning.
//
// Everything on it is drawn on her own shape. There used to be a row of
// coloured boxes standing inside the hull, one per compartment, each the full
// beam and a constant depth, and the colour of her damage was the colour of
// those boxes -- so a hit forward lit a slab that had nothing whatever to do
// with the shape of her bow, and the water in her was a rectangle in a ship.
// Her plating is welded one buffer per compartment (see interior.js), so the
// compartment that has been hit is shown by colouring the plating that is
// actually there; and her lines can be measured off those same buffers, so the
// water in her is the shape of the inside of the ship.

import * as THREE from '../../../vendor/three.module.js';
import { buildShip } from './ships.js';
import { SHIP_CLASSES } from '../../../shared/ships.js';
import { SECTIONS, freeboardOf } from '../../../shared/sim.js';
import { meshSection } from './interior.js';

// Sound, hurt, gone. Read straight off the compartment, so the board says the
// same thing the simulation does.
const SOUND = new THREE.Color(0x58c8e8);
const HURT = new THREE.Color(0xe2c14f);
const GONE = new THREE.Color(0xe2564f);
// Anything of hers that is not a length of hull -- her masts, her boats, the
// insides she is drawn with -- has no compartment to take a colour from.
const NEUTRAL = new THREE.Color(0x2f6d84);

// How finely her lines are measured for the water: stations along her, levels
// up her side. Enough that the sea in her narrows into her bow and follows her
// bilge; few enough that the whole grid is a few thousand samples taken once,
// when the board is built.
const STATIONS = 64;
const LEVELS = 12;

export class DamageBoard {
  constructor(canvas, classId) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1.9, 1, 4000);
    this.scene.add(new THREE.HemisphereLight(0x9fd8ee, 0x0b1a24, 1.5));
    const key = new THREE.DirectionalLight(0xbfe8ff, 0.9);
    key.position.set(-0.4, 1, 0.6);
    this.scene.add(key);
    // How she is stood: turned about her mast, and tipped so you are looking
    // down on her. She turns herself until somebody takes hold of her, and
    // from then on she is theirs.
    this.spin = 0.6;
    this.tilt = 0.34;
    this.zoom = 1;
    this.held = false;
    this.time = 0;
    this.grabbed(canvas);
    this.build(classId);
  }

  /**
   * Take hold of her and turn her.
   *
   * A damage board you cannot turn is a picture of one side of a ship, and
   * the side you want is always the other one -- a hole in her starboard
   * quarter is behind the drawing. Drag to swing her round and to tip her over
   * so you can look down into her or up at her keel; pinch, or roll the wheel,
   * to come in closer. She stops turning herself the moment she is touched.
   */
  grabbed(canvas) {
    let last = null;
    let pinch = 0;
    const pts = new Map();
    // The panel scrolls and the chart pans; neither should happen because
    // somebody dragged the ship.
    canvas.style.touchAction = 'none';

    const turn = (dx, dy) => {
      this.held = true;
      this.spin -= dx * 0.011;
      // Not over the top: she tips from looking up at her keel to looking
      // straight down on her deck and stops there, because past either end
      // the drag reverses and it feels broken.
      this.tilt = Math.max(-0.6, Math.min(1.45, this.tilt + dy * 0.009));
    };
    const gap = () => {
      const [a, b] = [...pts.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture?.(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      last = { x: e.clientX, y: e.clientY };
      if (pts.size === 2) pinch = gap();
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const was = pts.get(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        // Two fingers: the gap between them is the zoom, and what is left of
        // the movement still turns her.
        const d = gap();
        if (pinch > 8 && d > 8) {
          this.zoom = Math.max(0.45, Math.min(3.2, this.zoom * (d / pinch)));
          pinch = d;
        }
        return;
      }
      turn(e.clientX - was.x, e.clientY - was.y);
      last = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = 0;
      if (!pts.size) last = null;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', up);
    canvas.addEventListener('wheel', (e) => {
      this.zoom = Math.max(0.45, Math.min(3.2, this.zoom * Math.pow(1.12, -Math.sign(e.deltaY))));
      e.preventDefault();
    }, { passive: false });
    // Back to where she started: turning herself, on the beam, at full length.
    canvas.addEventListener('dblclick', () => {
      this.held = false;
      this.tilt = 0.34;
      this.zoom = 1;
    });
  }

  /**
   * Stand a hull on the board.
   *
   * Called again when the board is asked to show somebody else's ship -- a
   * captain watching another ship from her own bridge reads her condition,
   * and reading a Fletcher's compartments off a drawing of an Iowa is worse
   * than useless. Only the model is rebuilt; the renderer and the canvas it
   * is drawing into are kept, because a WebGL context is not a thing to throw
   * away and make again every time somebody taps the chart.
   */
  build(classId) {
    if (this.classId === classId) return;
    this.classId = classId;
    if (this.rig) {
      this.scene.remove(this.rig);
      this.rig.traverse((o) => {
        if (o.isMesh) { o.geometry?.dispose?.(); }
      });
    }

    const cls = SHIP_CLASSES[classId];
    this.len = cls.hull.length;
    this.beam = cls.hull.beam;
    this.draft = cls.hull.draft;

    this.rig = new THREE.Group();
    this.scene.add(this.rig);
    const built = buildShip(classId);
    this.hull = built.group;
    // Her lines, measured off the buffers she is drawn with, before she is put
    // in the rig -- once the rig is turning, a mesh's world matrix carries the
    // turn with it and every reading comes out somewhere else.
    this.hull.updateMatrixWorld(true);
    this.lines = measureLines(this.hull);
    // Her main deck: how much of her stands out of the water, worked out the
    // way the simulation works it out, so the board and the ship agree. It is
    // where her fires burn and where her upperworks begin; the water in her
    // has nothing to do with it and is measured off her keel and her waterline
    // instead.
    this.deck = freeboardOf(cls);

    // Her own model, drawn as a hologram: her shape in outline, lit from
    // within rather than by the sun. It is the ship, not a diagram of one --
    // and the compartment a piece of her belongs to is what colours it, so her
    // condition is drawn on her plating instead of on a box standing inside
    // her.
    this.painted = [];
    const deck = this.deck;
    this.hull.traverse((o) => {
      if (!o.isMesh) return;
      // Normal blending, not additive: a wireframe hull drawn additively over
      // itself saturates, and what came out was a white slug rather than a
      // ship. Her shape has to survive being lit from inside.
      // Her plating carries the reading and everything else is context: her
      // frames, her machinery, her boats and her masts are held right back, or
      // the whole ship is a ball of wire at the size this panel is and the one
      // compartment that has been opened is lost in it.
      const mat = new THREE.MeshBasicMaterial({
        color: NEUTRAL, wireframe: true, transparent: true, opacity: 0.075,
        depthWrite: false,
      });
      o.material = mat;
      let k = meshSection(o);
      if (k) {
        mat.opacity = 0.22;
        // Her upperworks are welded into whichever length of hull they stand
        // over, because that is where they are; but a bridge tower is not part
        // of the compartment under it, and a captain reading the board wants
        // to see the upperworks light up when the upperworks are hit. So
        // anything standing clear above her main deck takes its colour from
        // the superstructure instead of from the deck it is bolted to.
        o.geometry.computeBoundingBox();
        const mid = o.geometry.boundingBox.getCenter(new THREE.Vector3());
        o.localToWorld(mid);
        if (mid.y > deck + 1.5) k = 'works';
        this.painted.push({ mat, k });
      }
    });
    this.rig.add(this.hull);

    // The bulkheads she is divided by, drawn at her own section rather than as
    // a rectangle the full beam: the division between one compartment and the
    // next is a real place on the ship and it is worth seeing where it is.
    this.parts = {};
    for (const sec of SECTIONS) {
      if (sec.from === null) continue;
      const half = this.len / 2;
      const z0 = Math.max(-1, sec.from) * half;
      const z1 = Math.min(1, sec.to) * half;
      this.parts[sec.k] = { z0, z1 };
      const bh = new THREE.Mesh(
        sectionPlane(this.lines, z1),
        new THREE.MeshBasicMaterial({
          color: 0x7fd4ec, transparent: true, opacity: 0.16,
          side: THREE.DoubleSide, depthWrite: false,
        }),
      );
      this.rig.add(bh);
    }

    // The sea in her: one body per compartment, cut to the inside of the ship
    // at that station, standing in the bottom of her and rising as she floods.
    this.water = {};
    for (const sec of SECTIONS) {
      if (sec.from === null) continue;
      const { z0, z1 } = this.parts[sec.k];
      const body = new THREE.Mesh(new THREE.BufferGeometry(),
        new THREE.MeshBasicMaterial({
          color: 0x1b5fc4, transparent: true, opacity: 0.55,
          side: THREE.DoubleSide, depthWrite: false,
        }));
      body.visible = false;
      body.renderOrder = 2;
      this.rig.add(body);
      // The surface of it. A body of blue inside a blue ship is hard to read
      // at the size this panel is; a bright sheet where the water actually
      // stands is not, and that level is the number a damage control officer
      // is after.
      const top = new THREE.Mesh(new THREE.BufferGeometry(),
        new THREE.MeshBasicMaterial({
          color: 0xcdf4ff, transparent: true, opacity: 0.9,
          side: THREE.DoubleSide, depthWrite: false,
        }));
      top.visible = false;
      top.renderOrder = 3;
      this.rig.add(top);
      this.water[sec.k] = { body, top, z0, z1, level: 0 };
    }

    // Where she is burning. A fire is in a compartment, so it is drawn
    // standing on the length of deck that compartment is: a handful of flames
    // that grow with it and never stand still.
    this.fires = {};
    for (const sec of SECTIONS) {
      const g = new THREE.Group();
      g.visible = false;
      const mid = sec.from === null ? this.len * 0.03
        : (this.parts[sec.k].z0 + this.parts[sec.k].z1) / 2;
      const span = sec.from === null ? this.len * 0.3
        : this.parts[sec.k].z1 - this.parts[sec.k].z0;
      const y = sec.from === null ? deck + this.beam * 0.42 : deck;
      for (let i = 0; i < 5; i++) {
        // Not blended additively. A flame added to the blue she is drawn in
        // comes out white, and a white flame on a blue ship is a light rather
        // than a fire; laid over her instead, it stays the colour it is.
        const f = new THREE.Mesh(
          new THREE.ConeGeometry(this.beam * 0.075, this.beam * 0.3, 5),
          new THREE.MeshBasicMaterial({
            color: i % 2 ? 0xffb03a : 0xff6a25, transparent: true,
            opacity: 0.9, depthWrite: false,
          }));
        f.position.set(
          (i / 4 - 0.5) * this.beam * 0.5,
          y + this.beam * 0.14,
          mid + ((i * 37) % 100 / 100 - 0.5) * span * 0.7,
        );
        f.renderOrder = 4;
        g.add(f);
      }
      this.rig.add(g);
      this.fires[sec.k] = { group: g, base: y };
    }

    // The sea running in through her plating, and running back out when the
    // pumps are going. A stream of chevrons on the side she was opened on,
    // marching in and down while she is making water and up and out while she
    // is losing it. This is the difference between "she has water in her" and
    // "she is still filling", which is the whole question at that moment.
    this.flow = {};
    for (const sec of SECTIONS) {
      if (sec.from === null) continue;
      const g = new THREE.Group();
      g.visible = false;
      const marks = [];
      for (let i = 0; i < 5; i++) {
        const m = new THREE.Mesh(chevron(this.beam * 0.1),
          new THREE.MeshBasicMaterial({
            color: 0xbfeaff, transparent: true, opacity: 0.9,
            side: THREE.DoubleSide, depthWrite: false, depthTest: false,
          }));
        m.renderOrder = 5;
        g.add(m);
        marks.push(m);
      }
      this.rig.add(g);
      this.flow[sec.k] = { group: g, marks };
    }

    // Where she has been holed. Marks are added as the hits come in.
    this.marks = new THREE.Group();
    this.rig.add(this.marks);
    // Big enough to read at this range, and drawn over the hull rather than
    // behind it: a hole you cannot see is not much of a damage board.
    this.markGeo = new THREE.SphereGeometry(Math.max(2, this.beam * 0.11), 10, 8);
    // Two kinds. A hole above her waterline is a hole; one below it is the way
    // the sea is getting in, and a damage control officer needs to tell them
    // apart at a glance.
    this.markMat = new THREE.MeshBasicMaterial({
      color: 0xffc07a, transparent: true, opacity: 0.95, depthTest: false,
    });
    this.wetMat = new THREE.MeshBasicMaterial({
      color: 0x4fd2ff, transparent: true, opacity: 0.95, depthTest: false,
    });

    this.frame(this.len);
  }

  /** Stand off far enough to see the whole of her. */
  frame(len) {
    this.dist = len * 1.15;
  }

  /**
   * A hole in her, at the point on her own hull where the shell went in.
   *
   * Wherever it went in. A hole used to be pushed out onto her side whatever
   * the shell had actually hit, so a bomb through her quarterdeck and a shell
   * into her bridge both came out as marks on her waterline -- which is the
   * one place neither of them was. Her plating is measured, so the mark can be
   * put on the plating nearest where the round stopped: her side, her deck or
   * her upperworks, as the case may be.
   */
  hole(lx, ly, lz) {
    if (this.marks.children.length > 90) {
      this.marks.remove(this.marks.children[0]);
    }
    const wet = ly < 0.4;
    const m = new THREE.Mesh(this.markGeo, wet ? this.wetMat : this.markMat);
    m.renderOrder = 3;
    const half = this.halfBeam(lz, ly);
    // Out onto her side only if it was in her side. A round that stopped near
    // her centreline was in her deck or her upperworks and the mark belongs
    // where it stopped.
    const out = Math.abs(lx) > half * 0.55;
    m.position.set(out ? Math.sign(lx || 1) * half : lx,
      Math.max(-this.draft * 1.1, Math.min(this.lines.top, ly)), lz);
    this.marks.add(m);
  }

  /** Her half-beam at a station and a height, off her own plating. */
  halfBeam(z, y) {
    return halfBeamAt(this.lines, z, y);
  }

  /**
   * How much sea is in each compartment, in tenths.
   *
   * Drawn as water standing in the shape of the inside of her: a body cut to
   * her own section at every station of the compartment, filling from the keel
   * up. It is the one thing a damage control officer actually needs to see and
   * the one thing a row of hit-point bars cannot show him.
   */
  setWater(wt) {
    if (!wt || !this.water) return;
    SECTIONS.forEach((sec, i) => {
      const w = this.water[sec.k];
      if (!w) return;
      const f = Math.max(0, Math.min(1, (wt[i] || 0) / 9));
      w.level = f;
      const on = f > 0.01;
      w.body.visible = on;
      w.top.visible = on;
      if (!on) return;
      // Only when it has moved enough to see: the geometry is rebuilt from her
      // lines, and rebuilding it for a thousandth of a metre a frame is work
      // nobody is going to look at.
      if (Math.abs(f - (w.drawn ?? -1)) < 0.004) return;
      w.drawn = f;
      const y = waterTop(this.lines, f);
      fillTo(w.body.geometry, this.lines, w.z0, w.z1, y);
      capAt(w.top.geometry, this.lines, w.z0, w.z1, y);
      w.body.material.opacity = 0.4 + f * 0.3;
    });
  }

  /** Which of her compartments are alight, in tenths. */
  setFires(fr) {
    if (!fr || !this.fires) return;
    SECTIONS.forEach((sec, i) => {
      const f = this.fires[sec.k];
      if (!f) return;
      const v = Math.max(0, Math.min(1, (fr[i] || 0) / 9));
      f.group.visible = v > 0.02;
      f.level = v;
    });
  }

  /**
   * Where the sea is running, and which way.
   *
   * `fw` is what the wire carries: how hard each compartment is making water,
   * in ninths, negative where the pumps are winning. `fs` is the side of her
   * that compartment was opened on. A stream that is coming in runs in through
   * her plating and down into the water standing in her; one that is going out
   * runs the other way, which is what the second call-away of the damage
   * control party buys and the only visible difference it makes.
   */
  setFlow(fw, fs) {
    if (!this.flow) return;
    SECTIONS.forEach((sec, i) => {
      const fl = this.flow[sec.k];
      if (!fl) return;
      const rate = fw ? (fw[i] || 0) / 9 : 0;
      fl.rate = rate;
      fl.side = (fs && fs[i]) || 1;
      fl.group.visible = Math.abs(rate) > 0.02;
    });
  }

  /** What is left of each compartment: the colour her own plating takes. */
  setCondition(sec) {
    if (!sec || !this.painted) return;
    const by = {};
    SECTIONS.forEach((s, i) => {
      if (!sec[i]) return;
      by[s.k] = Math.max(0, Math.min(1, sec[i][0] / 100));
    });
    for (const p of this.painted) {
      const f = by[p.k];
      if (f === undefined) continue;
      const col = f > 0.6 ? SOUND.clone().lerp(HURT, (1 - f) / 0.4)
        : HURT.clone().lerp(GONE, Math.min(1, (0.6 - f) / 0.6));
      p.mat.color.copy(col);
      // And it comes up out of the drawing as it goes: sound plating is a
      // faint blue outline, wrecked plating is bright and red and impossible
      // to miss on a ship turning slowly in the corner of the screen.
      p.mat.opacity = 0.2 + (1 - f) * 0.56;
    }
  }

  /** `sec` is the wire's [integrity 0-100, penetrations] per compartment. */
  update(sec, dt) {
    this.time += dt;
    // She turns herself slowly until somebody takes hold of her.
    if (!this.held) this.spin += dt * 0.24;
    this.rig.rotation.y = this.spin;
    this.rig.rotation.x = this.tilt;
    this.setCondition(sec);
    this.stepFires(dt);
    this.stepFlow();
    const w = this.canvas.clientWidth || 300;
    const h = this.canvas.clientHeight || 160;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / Math.max(1, h);
      this.camera.updateProjectionMatrix();
    }
    const d = this.dist / this.zoom;
    this.camera.position.set(0, d * 0.34, d);
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  /** Flames that never stand still, and grow with the fire under them. */
  stepFires(dt) {
    if (!this.fires) return;
    for (const k of Object.keys(this.fires)) {
      const f = this.fires[k];
      if (!f.group.visible) continue;
      const v = f.level || 0;
      f.group.children.forEach((m, i) => {
        const wob = 0.72 + 0.28 * Math.sin(this.time * (5.4 + i * 0.9) + i * 2.1);
        m.scale.set(0.5 + v * 0.9, (0.4 + v * 1.5) * wob, 0.5 + v * 0.9);
        m.position.y = f.base + this.beam * 0.14 * m.scale.y;
        m.material.opacity = 0.45 + 0.5 * v * wob;
      });
    }
  }

  /** The streams, marching in through her plating or back out of it. */
  stepFlow() {
    if (!this.flow) return;
    for (const sec of SECTIONS) {
      const fl = this.flow[sec.k];
      if (!fl || !fl.group.visible) continue;
      const w = this.water[sec.k];
      const zm = (w.z0 + w.z1) / 2;
      // Where it comes in: on the side she was opened on, at the waterline,
      // which is where a hole that matters is. Where it is going: down into
      // whatever is standing in the compartment already.
      const half = this.halfBeam(zm, 0) || this.beam * 0.5;
      const inflow = fl.rate > 0;
      const ax = fl.side * half, ay = 0;
      const bx = fl.side * half * 0.18;
      const by = waterTop(this.lines, Math.max(0.06, w.level || 0));
      const speed = 0.35 + Math.min(1, Math.abs(fl.rate)) * 1.1;
      fl.marks.forEach((m, i) => {
        // Marching along the run, one behind the other, and round again.
        let u = ((this.time * speed + i / fl.marks.length) % 1);
        if (!inflow) u = 1 - u;
        m.position.set(ax + (bx - ax) * u, ay + (by - ay) * u, zm);
        // Pointing the way the water is going.
        m.rotation.z = Math.atan2(by - ay, bx - ax) * (inflow ? 1 : -1)
          + (fl.side < 0 ? Math.PI : 0);
        // Fading in at the plating and out at the water, so the stream reads
        // as a run rather than as five beads on a wire.
        m.material.opacity = 0.25 + 0.75 * Math.sin(Math.PI * u);
      });
      // Going in is the sea; coming out is the pumps beating it. Every mark
      // carries its own material -- they fade independently along the run --
      // so every one of them has to be told.
      const hue = inflow ? 0xbfeaff : 0x7fe0a0;
      for (const m of fl.marks) m.material.color.setHex(hue);
    }
  }

  dispose() {
    this.renderer.dispose();
  }
}

/**
 * Her lines, off the buffers she is drawn with.
 *
 * A grid: how far out her plating stands at every station along her and every
 * level up her, so the water inside her can be cut to the inside of the ship
 * instead of to a box. Taken once when the board is built, from the same
 * welded meshes the hull is drawn from, so it is her shape and not a guess at
 * it -- a hull with a fine bow and a transom stern comes out with a fine bow
 * and a transom stern.
 *
 * From her keel up to her waterline, and no further, because that is what the
 * water in her is measured against: a compartment the wire calls full holds
 * the volume the simulation gives it, and that is her underwater box (see
 * sectionVolume). Water standing to her waterline is a compartment pressed
 * full, which is the right thing for the board to draw.
 */
export function measureLines(hull) {
  let minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
  const meshes = [];
  const v = new THREE.Vector3();
  hull.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    if (!meshSection(o)) return;
    meshes.push(o);
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      if (v.z < minZ) minZ = v.z;
      if (v.z > maxZ) maxZ = v.z;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }
  });
  if (!meshes.length) return { minZ: -1, maxZ: 1, keel: -1, wl: 0, top: 1, grid: null };
  const keel = minY;
  const wl = 0;
  const grid = new Float32Array(STATIONS * LEVELS);
  for (const o of meshes) {
    const pos = o.geometry.attributes.position;
    for (let p = 0; p < pos.count; p++) {
      v.fromBufferAttribute(pos, p).applyMatrix4(o.matrixWorld);
      if (v.y > wl) continue;
      const s = Math.min(STATIONS - 1, Math.max(0,
        Math.floor((v.z - minZ) / (maxZ - minZ) * STATIONS)));
      const l = Math.min(LEVELS - 1, Math.max(0,
        Math.floor((v.y - keel) / Math.max(0.001, wl - keel) * LEVELS)));
      const a = Math.abs(v.x);
      if (a > grid[s * LEVELS + l]) grid[s * LEVELS + l] = a;
    }
  }
  // A level with nothing in it -- a station where her plating happens to have
  // no vertex at that height -- takes the one below it, so the section is
  // continuous from the keel up rather than pinching to nothing in the middle.
  // Then downward as well, because the flat of her bottom is drawn with far
  // fewer vertices than her side and the lowest levels are the sparse ones.
  for (let s = 0; s < STATIONS; s++) {
    let last = 0;
    for (let l = 0; l < LEVELS; l++) {
      const at = s * LEVELS + l;
      if (grid[at] <= 0.01) grid[at] = last;
      else last = grid[at];
    }
    last = 0;
    for (let l = LEVELS - 1; l >= 0; l--) {
      const at = s * LEVELS + l;
      if (grid[at] <= 0.01) grid[at] = last * 0.6;
      else last = grid[at];
    }
  }
  return { minZ, maxZ, keel, wl, top: maxY, grid };
}

/**
 * How high the water stands in a compartment that is `f` full.
 *
 * Between her keel and her waterline, because that is what the wire's figure
 * is a fraction of: the simulation measures a compartment's volume as her
 * underwater box (see sectionVolume), so pressed full means full to her
 * waterline. Filling to her main deck instead drew a ship reported half full
 * with the sea standing well above the sea she is floating in.
 */
export function waterTop(lines, f) {
  const k = Math.max(0, Math.min(1, f));
  return lines.keel + (lines.wl - lines.keel) * k;
}

/** How far out her plating stands at a station and a height. */
export function halfBeamAt(lines, z, y) {
  if (!lines.grid) return 1;
  const s = Math.min(STATIONS - 1, Math.max(0,
    Math.floor((z - lines.minZ) / (lines.maxZ - lines.minZ) * STATIONS)));
  const l = Math.min(LEVELS - 1, Math.max(0,
    Math.floor((y - lines.keel) / Math.max(0.001, lines.wl - lines.keel) * LEVELS)));
  return lines.grid[s * LEVELS + l];
}

/**
 * The water in one compartment, filled to a height.
 *
 * Written straight into the buffer rather than made again: the level moves
 * every frame a compartment is filling, and a new geometry a frame is a new
 * upload a frame for nothing.
 */
export function fillTo(geo, lines, z0, z1, y) {
  const n = 10;
  const verts = [];
  const at = (j) => z0 + (z1 - z0) * (j / n);
  const quad = (a, b, c, d) => {
    verts.push(...a, ...b, ...c, ...a, ...c, ...d);
  };
  for (let j = 0; j < n; j++) {
    const za = at(j), zb = at(j + 1);
    const ba = halfBeamAt(lines, za, y), bb = halfBeamAt(lines, zb, y);
    const ka = halfBeamAt(lines, za, lines.keel), kb = halfBeamAt(lines, zb, lines.keel);
    const k = lines.keel;
    // Starboard side, port side, the bottom and the top, each following her
    // section: the water is the shape of the room it is standing in.
    quad([ka, k, za], [ba, y, za], [bb, y, zb], [kb, k, zb]);
    quad([-kb, k, zb], [-bb, y, zb], [-ba, y, za], [-ka, k, za]);
    quad([-ka, k, za], [ka, k, za], [kb, k, zb], [-kb, k, zb]);
    quad([-ba, y, za], [-bb, y, zb], [bb, y, zb], [ba, y, za]);
  }
  // The two ends of it, so a compartment half full does not look through into
  // the next one.
  for (const [z, s] of [[z0, -1], [z1, 1]]) {
    const b = halfBeamAt(lines, z, y);
    const kb = halfBeamAt(lines, z, lines.keel);
    const k = lines.keel;
    if (s > 0) quad([-kb, k, z], [-b, y, z], [b, y, z], [kb, k, z]);
    else quad([kb, k, z], [b, y, z], [-b, y, z], [-kb, k, z]);
  }
  setPositions(geo, verts);
}

/** The surface of the water in one compartment: a sheet at her own section. */
function capAt(geo, lines, z0, z1, y) {
  const n = 10;
  const verts = [];
  for (let j = 0; j < n; j++) {
    const za = z0 + (z1 - z0) * (j / n);
    const zb = z0 + (z1 - z0) * ((j + 1) / n);
    const ba = halfBeamAt(lines, za, y), bb = halfBeamAt(lines, zb, y);
    verts.push(-ba, y, za, ba, y, za, bb, y, zb);
    verts.push(-ba, y, za, bb, y, zb, -bb, y, zb);
  }
  setPositions(geo, verts);
}

/** A bulkhead at a station, cut to her section there. */
function sectionPlane(lines, z) {
  const geo = new THREE.BufferGeometry();
  const verts = [];
  const k = lines.keel;
  for (let l = 0; l < LEVELS; l++) {
    const y0 = k + (lines.wl - k) * (l / LEVELS);
    const y1 = k + (lines.wl - k) * ((l + 1) / LEVELS);
    const b0 = halfBeamAt(lines, z, y0), b1 = halfBeamAt(lines, z, y1);
    verts.push(-b0, y0, z, b0, y0, z, b1, y1, z);
    verts.push(-b0, y0, z, b1, y1, z, -b1, y1, z);
  }
  setPositions(geo, verts);
  return geo;
}

/** An arrowhead, pointing along +x, for the streams. */
function chevron(r) {
  const geo = new THREE.BufferGeometry();
  setPositions(geo, [
    r, 0, 0, -r * 0.7, r * 0.7, 0, -r * 0.25, 0, 0,
    r, 0, 0, -r * 0.25, 0, 0, -r * 0.7, -r * 0.7, 0,
  ]);
  return geo;
}

/**
 * Put a list of triangles into a buffer, growing it only when it must.
 *
 * No normals: everything the board draws is unlit -- it is a hologram, and a
 * hologram is not shaded by anything -- so working them out for the water
 * every time the level moves would be a per-frame cost for a buffer nothing
 * reads.
 */
function setPositions(geo, verts) {
  const have = geo.attributes.position;
  if (have && have.array.length === verts.length) {
    have.array.set(verts);
    have.needsUpdate = true;
  } else {
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  }
  geo.computeBoundingSphere();
}
