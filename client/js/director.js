// The director's chair: what a staged battle, or a replay, is watched from.
//
// There is no ship under him and nothing to fight, so the conning keys come
// off the bottom of the screen and a bar goes up in their place: stop the
// action, run it slow or fast, let the camera off its leash, hand the camera
// to the script, take every piece of furniture off the screen for a clean
// shot. In a replay the same bar winds the battle back and forth.
//
// The script's camera is worked from here too. A shot is a moment and a way
// of looking (see SHOTS in shared/stage.js): it is cut to -- or glided to --
// when the battle reaches that moment, and held until the next one.

import * as THREE from '../../vendor/three.module.js';
import { VIEWS, clockOf } from '../../shared/stage.js';
import { lerp, wrapAngle, clamp } from '../../shared/math.js';
import { audio } from './audio.js';

const KINDS = { s: 'ship', g: 'battery', b: 'bomber' };

/** The speeds the bar offers, a live battle and a replay alike. */
const SPEEDS = [0.25, 0.5, 1, 2, 4];

const FROM_Q = new THREE.Quaternion();
const TO_Q = new THREE.Quaternion();
const AT = new THREE.Vector3();

const smooth = (k) => k * k * (3 - 2 * k);

export class Director {
  /**
   * `stage` is what the room said about the script: unit key -> id, and the
   * shots. `replay` is the ReplayNet when this is a recording being played.
   */
  constructor(battle, { stage = null, replay = null, title = 'Staged Battle' } = {}) {
    this.b = battle;
    this.units = (stage && stage.units) || {};
    this.shots = (stage && stage.shots) || [];
    this.replay = replay;
    this.title = title;
    this.rate = 1;
    this.held = 1;              // the speed a pause goes back to
    this.scriptCam = this.shots.length > 0;
    this.shotIx = -1;
    this.shot = null;
    this.from = null;
    this.shotWall = 0;
    this.clean = false;
    this.root = document.getElementById('screen-battle');
    this.root?.classList.add('director');
    this.build();
    this.onKeyDown = (e) => this.key(e);
    window.addEventListener('keydown', this.onKeyDown);
    this.paint();
  }

  // ------------------------------------------------------------------ bar --

  build() {
    const bar = document.getElementById('director-bar');
    if (!bar) return;
    bar.hidden = false;
    const speeds = SPEEDS.map((s) => `<button type="button" class="dir-speed" data-s="${s}">${
      s === 0.25 ? '¼' : s === 0.5 ? '½' : s}×</button>`).join('');
    bar.innerHTML = `
      <div class="dir-row">
        <span class="dir-title">${this.title}</span>
        <button type="button" class="dir-key" id="dir-play" aria-label="Pause">❚❚</button>
        <div class="dir-speeds">${speeds}</div>
        <span class="dir-clock" id="dir-clock">0:00</span>
        ${this.replay ? `
          <button type="button" class="dir-key" id="dir-back" aria-label="Back ten seconds">−10s</button>
          <button type="button" class="dir-key" id="dir-fwd" aria-label="On ten seconds">+10s</button>
          <button type="button" class="dir-key" id="dir-again" aria-label="From the start">⟲</button>` : ''}
      </div>
      ${this.replay ? '<input type="range" class="dir-seek" id="dir-seek" min="0" step="0.1" value="0" aria-label="Where in the battle">' : ''}
      <div class="dir-row">
        <button type="button" class="dir-key" id="dir-prev" aria-label="Previous ship">◀</button>
        <button type="button" class="dir-key" id="dir-next" aria-label="Next ship">Follow ▶</button>
        <button type="button" class="dir-key" id="dir-view">View</button>
        <button type="button" class="dir-key" id="dir-free">Free cam</button>
        <button type="button" class="dir-key" id="dir-script" ${this.shots.length ? '' : 'disabled'}>Script cam</button>
        <button type="button" class="dir-key" id="dir-clean">Hide HUD</button>
        <button type="button" class="dir-key end" id="dir-end">${this.replay ? 'Close replay' : 'End'}</button>
      </div>`;
    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.onclick = (e) => { e.stopPropagation(); audio.click(); fn(); };
    };
    on('dir-play', () => this.togglePause());
    bar.querySelectorAll('.dir-speed').forEach((el) => {
      el.onclick = (e) => { e.stopPropagation(); audio.click(); this.setSpeed(Number(el.dataset.s)); };
    });
    on('dir-back', () => this.seekBy(-10));
    on('dir-fwd', () => this.seekBy(10));
    on('dir-again', () => this.seekTo(0));
    on('dir-prev', () => this.cycle(-1));
    on('dir-next', () => this.cycle(1));
    on('dir-view', () => this.swapView());
    on('dir-free', () => this.freeCam());
    on('dir-script', () => this.setScriptCam(!this.scriptCam));
    on('dir-clean', () => this.setClean(true));
    on('dir-end', () => this.b.leave());
    const seek = document.getElementById('dir-seek');
    if (seek && this.replay) {
      seek.max = String(Math.max(1, this.replay.length));
      // Dragging the thumb winds the battle; letting go leaves it there.
      seek.oninput = () => { this.seeking = true; this.seekTo(Number(seek.value)); };
      seek.onchange = () => { this.seeking = false; };
    }
    // The way back from a clean screen: the faint X in the bottom right corner.
    const peek = document.getElementById('director-peek');
    if (peek) peek.onclick = () => this.setClean(false);
  }

  /** The bar says what is true now. */
  paint() {
    const play = document.getElementById('dir-play');
    if (play) {
      play.textContent = this.rate === 0 ? '▶' : '❚❚';
      play.setAttribute('aria-label', this.rate === 0 ? 'Play' : 'Pause');
    }
    document.querySelectorAll('#director-bar .dir-speed').forEach((el) => {
      el.classList.toggle('on', Number(el.dataset.s) === (this.rate || this.held));
    });
    document.getElementById('dir-script')?.setAttribute('aria-pressed', this.scriptCam ? 'true' : 'false');
    document.getElementById('dir-free')?.setAttribute('aria-pressed', this.b.freeCam ? 'true' : 'false');
  }

  // --------------------------------------------------------------- clock --

  /** Seconds of battle, as the picture is drawing it. */
  now() {
    const t = this.b.renderST;
    return Number.isFinite(t) ? t : 0;
  }

  setSpeed(s) {
    this.held = s;
    this.rate = s;
    this.b.net.send({ t: 'warp', s });
    this.paint();
  }

  togglePause() {
    if (this.rate === 0) this.setSpeed(this.held || 1);
    else {
      this.held = this.rate;
      this.rate = 0;
      this.b.net.send({ t: 'warp', s: 0 });
      this.paint();
    }
  }

  /** The room has said how fast it is running: the bar follows it. */
  heard(s) {
    this.rate = s;
    if (s > 0) this.held = s;
    this.paint();
  }

  seekBy(d) {
    if (!this.replay) return;
    this.seekTo(this.replay.at + d);
  }

  seekTo(at) {
    if (!this.replay) return;
    this.replay.seek(Math.max(0, Math.min(this.replay.length, at)));
    // The script's camera picks the shot for the new moment afresh.
    this.shotIx = -1;
  }

  // -------------------------------------------------------------- camera --

  /** Hand the camera to the script, or take it back. */
  setScriptCam(on) {
    this.scriptCam = !!on && this.shots.length > 0;
    this.shotIx = -1;
    this.shot = null;
    this.from = null;
    this.b.hud.alert(this.scriptCam ? 'Script camera' : 'Camera is yours');
    this.paint();
  }

  /** Something the director did himself took the camera: the script lets go of it. */
  tookCamera() {
    if (!this.scriptCam || this.driving) return;
    this.scriptCam = false;
    this.shot = null;
    this.from = null;
    this.paint();
  }

  freeCam() {
    this.tookCamera();
    this.b.freeCamera(!this.b.freeCam);
    this.paint();
  }

  /** Every ship there is to follow, in the order the plot lists them. */
  afloat() {
    const snap = this.b.snapshots[this.b.snapshots.length - 1];
    if (!snap) return [];
    return snap.ships.filter((s) => s.a || this.b.scene.shipViews.get(s.i)?.group.visible)
      .sort((a, b) => a.tm - b.tm || a.i - b.i);
  }

  cycle(dir) {
    const list = this.afloat();
    if (!list.length) return;
    const w = this.b.watching;
    const at = w && w.kind === 'ship' ? list.findIndex((s) => s.i === w.id) : -1;
    const next = list[(at + dir + list.length) % list.length];
    this.tookCamera();
    this.watch({ kind: 'ship', id: next.i });
    this.b.watchPov = false;
    this.b.hud.setWatchBanner(this.b.watching, this.b.watchPov);
  }

  swapView() {
    if (!this.b.watching) return;
    this.tookCamera();
    this.b.watchPov = !this.b.watchPov;
    this.b.hud.setWatchBanner(this.b.watching, this.b.watchPov);
  }

  /** Put the camera on something without the click a captain's tap makes. */
  watch(hit) {
    const w = this.b.watching;
    if (w && hit && w.kind === hit.kind && w.id === hit.id) return;
    // Named the way the plot names it, for the banner over the plot.
    if (hit && !hit.name) hit = { ...hit, name: this.nameOf(hit) };
    this.driving = true;
    try { this.b.lookAt(hit, true); } finally { this.driving = false; }
  }

  setClean(on) {
    this.clean = !!on;
    this.root?.classList.toggle('clean', this.clean);
    document.body.classList.toggle('dir-clean', this.clean);
    if (this.clean && this.b.mapBig) this.b.toggleMap(false);
  }

  key(e) {
    if (!this.root?.classList.contains('active')) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && t.type !== 'range') return;
    switch (e.code) {
      case 'Space': e.preventDefault(); this.togglePause(); break;
      case 'KeyH': this.setClean(!this.clean); break;
      case 'KeyF': this.freeCam(); break;
      case 'KeyK': this.setScriptCam(!this.scriptCam); break;
      case 'KeyN': this.cycle(1); break;
      case 'KeyV': this.swapView(); break;
      case 'BracketLeft': this.stepSpeed(-1); break;
      case 'BracketRight': this.stepSpeed(1); break;
      case 'Comma': this.seekBy(-10); break;
      case 'Period': this.seekBy(10); break;
      default: break;
    }
  }

  stepSpeed(dir) {
    const now = this.rate || this.held;
    const i = SPEEDS.indexOf(now);
    this.setSpeed(SPEEDS[clamp((i < 0 ? 2 : i) + dir, 0, SPEEDS.length - 1)]);
  }

  /**
   * Before the battle places its camera: the shot due now is cut to, and a
   * follow shot keeps its station on whatever it is following.
   */
  beforeCamera() {
    const clock = document.getElementById('dir-clock');
    const t = this.now();
    if (clock) {
      const total = this.replay ? ` / ${clockOf(this.replay.length)}` : '';
      const text = `${clockOf(this.replay ? this.replay.at : t)}${total}`;
      if (text !== this.clockText) { clock.textContent = text; this.clockText = text; }
    }
    const seek = document.getElementById('dir-seek');
    if (seek && this.replay && !this.seeking) seek.value = String(this.replay.at);
    if (!this.scriptCam || !this.shots.length) return;
    // Nothing to point a camera at until the first picture of the battle is in.
    if (!Number.isFinite(this.b.renderST) || !this.b.snapshots.length) return;
    let ix = -1;
    for (let i = 0; i < this.shots.length; i++) if (this.shots[i].t <= t) ix = i;
    if (ix !== this.shotIx) {
      this.shotIx = ix;
      if (ix >= 0) this.cut(this.shots[ix], t);
    }
    const sh = this.shot;
    if (sh && sh.k === 'follow') {
      // Whatever she is, she is followed for as long as there is any of her
      // to see; if the camera lost her for a moment, it goes back to her.
      if (!this.b.watching && this.present(sh.u)) {
        this.watch({ kind: KINDS[String(sh.u)[0]], id: this.units[sh.u] });
      }
      this.keepStation(sh, t);
    }
  }

  /** The camera as it stands, to glide away from. */
  pose() {
    const cam = this.b.scene.camera;
    return { pos: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov };
  }

  cut(sh, t) {
    this.from = sh.glide > 0 ? this.pose() : null;
    this.shot = sh;
    this.shotAt = t;
    this.shotWall = performance.now() / 1000;
    if (sh.k === 'follow') {
      const id = this.units[sh.u];
      const kind = KINDS[String(sh.u)[0]];
      if (id == null || !kind) { this.shot = null; return; }
      this.watch({ kind, id });
      const v = VIEWS[sh.view] || VIEWS.quarter;
      const b = this.b;
      b.watchPov = !!v.pov;
      if (!v.pov) {
        b.watchEl = v.el;
        b.watchDist = v.dist;
        if (!sh.glide) b.watchDistNow = v.dist;
      } else {
        b.watchPitch = 0.04;
        b.watchFov = 52;
      }
      b.hud.setWatchBanner(b.watching, b.watchPov);
      this.keepStation(sh, t, true);
    } else if (sh.k === 'fixed') {
      this.watch(null);
      if (this.b.freeCam) this.b.freeCamera(false);
    } else {
      // Free: the camera stays where the last shot left it, and is the
      // director's from here.
      this.watch(null);
      const f = this.b.focusPoint();
      this.b.roam = { x: f.x, z: f.z };
      this.shot = null;
    }
  }

  /** What a unit is called, off the latest picture of the battle. */
  nameOf(hit) {
    const snap = this.b.snapshots[this.b.snapshots.length - 1];
    if (!snap) return 'the battle';
    if (hit.kind === 'ship') {
      const s = snap.ships.find((q) => q.i === hit.id);
      return s ? s.n || 'a ship' : 'a ship';
    }
    return hit.kind === 'battery' ? 'the battery' : hit.kind === 'bomber' ? 'the squadron' : 'the battle';
  }

  /** Whether a unit of the script's is in the picture at all. */
  present(key) {
    const id = this.units[key];
    const snap = this.b.snapshots[this.b.snapshots.length - 1];
    if (!snap || id == null) return false;
    const list = key[0] === 'g' ? snap.batteries : key[0] === 'b' ? snap.bombers : snap.ships;
    return (list || []).some((q) => q.i === id);
  }

  /** A follow shot's station off her, turned with her as she turns. */
  keepStation(sh, t, snap = false) {
    const b = this.b;
    if (!b.watching) return;
    const v = VIEWS[sh.view] || VIEWS.quarter;
    const h = b.headingOf(b.watching);
    if (h === null) return;
    const spin = ((sh.spin || 0) * Math.PI / 180) * Math.max(0, t - this.shotAt);
    const want = wrapAngle(h + (v.pov ? 0 : v.yaw) + spin);
    // Eased onto rather than set: the heading off the wire is a step a tenth
    // of a second, and a camera that took every step would judder with it.
    b.watchYaw = snap ? want : wrapAngle(b.watchYaw + wrapAngle(want - b.watchYaw) * 0.08);
    if (v.pov) b.watchPitch = 0.04;
  }

  /** After the battle has placed its camera: a fixed shot, and the glide into any shot. */
  afterCamera() {
    if (!this.scriptCam) return;
    const sh = this.shot;
    const cam = this.b.scene.camera;
    if (sh && sh.k === 'fixed') {
      cam.position.set(sh.x, sh.y, sh.z);
      const look = this.lookPoint(sh);
      cam.up.set(0, 1, 0);
      cam.lookAt(look);
      cam.fov = sh.fov || 50;
    }
    if (sh && this.from) {
      const k = clamp((performance.now() / 1000 - this.shotWall) / Math.max(0.01, sh.glide), 0, 1);
      if (k >= 1) this.from = null;
      else {
        const e = smooth(k);
        FROM_Q.copy(this.from.q);
        TO_Q.copy(cam.quaternion);
        cam.position.lerpVectors(this.from.pos, cam.position, e);
        cam.quaternion.copy(FROM_Q.slerp(TO_Q, e));
        cam.fov = lerp(this.from.fov, cam.fov, e);
      }
    }
    cam.updateProjectionMatrix();
  }

  /** What a fixed camera is looking at: a unit wherever she has got to, or a point. */
  lookPoint(sh) {
    if (sh.look) {
      const id = this.units[sh.look];
      const kind = sh.look[0];
      if (kind === 's') {
        const v = this.b.scene.shipViews.get(id);
        if (v) return AT.set(v.group.position.x, 8, v.group.position.z);
      }
      const snap = this.b.snapshots[this.b.snapshots.length - 1];
      const list = kind === 'g' ? snap?.batteries : kind === 'b' ? snap?.bombers : snap?.ships;
      const u = (list || []).find((q) => q.i === id);
      if (u) return AT.set(u.x, u.y ?? 8, u.z);
    }
    return AT.set(sh.lx ?? 0, 4, sh.lz ?? 0);
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    this.root?.classList.remove('director', 'clean');
    document.body.classList.remove('dir-clean');
    const bar = document.getElementById('director-bar');
    if (bar) { bar.hidden = true; bar.innerHTML = ''; }
  }
}

