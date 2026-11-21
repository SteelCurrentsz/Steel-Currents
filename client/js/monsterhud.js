// Monster One's own controls: a bar of keys along the foot of the screen
// while she is the one being conned. Her breath, with how long until it is
// ready and how far up her the glow has climbed while it gathers; her tail;
// her hands, which take hold of the ship in front of her and throw the one
// they have, and crush it; her jaws; how she is going about (down, swimming,
// standing); and her roar. Each says on it what it is waiting for.
//
// It can be folded away to a small tab (its own button, or the ` key), so
// whatever it covers on the screen can be clicked; her keys still work while
// it is folded, and it stays folded until it is opened again.
//
// Made the first time she is conned, and put away on its own whenever she
// stops being (nothing has told it so for half a second).
import { MONSTER } from '../../shared/monster.js';
import { getClass } from '../../shared/ships.js';

const CSS = `
.mo-bar { position: fixed; left: 50%; bottom: 128px; transform: translateX(-50%); z-index: 40;
  display: flex; gap: 8px; padding: 8px; border-radius: 14px;
  background: rgba(6, 14, 24, 0.72); border: 1px solid rgba(88, 214, 255, 0.35);
  box-shadow: 0 0 24px rgba(47, 180, 255, 0.18); backdrop-filter: blur(4px);
  font-family: inherit; user-select: none; -webkit-user-select: none; }
.mo-bar[hidden] { display: none; }
.mo-bar.folded > :not(.mo-fold) { display: none; }
.mo-bar.folded { padding: 0; gap: 0; background: none; border: none; box-shadow: none; backdrop-filter: none; }
.mo-fold { position: absolute; right: -10px; top: -12px; width: 24px; height: 24px; padding: 0; border-radius: 12px;
  color: #dff6ff; background: rgba(6, 14, 24, 0.9); border: 1px solid rgba(88, 214, 255, 0.5); cursor: pointer;
  font-size: 0.8rem; line-height: 22px; text-align: center; touch-action: manipulation; z-index: 1; }
.mo-fold:hover { background: rgba(88, 214, 255, 0.25); }
.mo-bar.folded .mo-fold { position: static; width: auto; height: auto; padding: 5px 12px; border-radius: 10px;
  font-size: 0.78rem; line-height: 1.2; letter-spacing: 0.04em; box-shadow: 0 0 12px rgba(47, 180, 255, 0.25); }
.mo-key { position: relative; min-width: 82px; padding: 8px 10px 9px; border-radius: 10px; cursor: pointer;
  color: #dff6ff; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.12);
  text-align: center; line-height: 1.15; overflow: hidden; touch-action: manipulation; }
.mo-key:hover { background: rgba(88, 214, 255, 0.14); }
.mo-key b { display: block; font-size: 0.95rem; letter-spacing: 0.04em; }
.mo-key span { display: block; font-size: 0.72rem; opacity: 0.75; margin-top: 2px; }
.mo-key kbd { position: absolute; top: 4px; right: 6px; font-size: 0.62rem; opacity: 0.55; font-family: inherit; }
.mo-key.wait { opacity: 0.55; }
.mo-key.live { border-color: rgba(88, 214, 255, 0.9); box-shadow: 0 0 14px rgba(88, 214, 255, 0.55) inset; }
.mo-key .mo-fill { position: absolute; left: 0; bottom: 0; height: 3px; width: 0; background: #58d6ff;
  box-shadow: 0 0 8px #58d6ff; transition: width 0.15s linear; }
.mo-hp { position: absolute; left: 10px; right: 10px; top: -7px; height: 4px; border-radius: 2px;
  background: rgba(255, 255, 255, 0.12); overflow: hidden; }
.mo-hp i { display: block; height: 100%; background: linear-gradient(90deg, #ff5a4a, #ffd27a 45%, #58d6ff); }
.mo-aim { position: relative; width: 74px; min-width: 74px; border-radius: 10px; cursor: crosshair;
  background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.12); touch-action: none; }
.mo-aim.live { border-color: rgba(255, 150, 90, 0.9); box-shadow: 0 0 14px rgba(255, 120, 70, 0.45) inset; }
.mo-aim .mo-ship { position: absolute; left: 10%; right: 10%; top: 40%; height: 40%;
  border-radius: 40% 40% 8px 8px / 60% 60% 8px 8px; background: rgba(160, 190, 210, 0.25); }
.mo-aim .mo-sea { position: absolute; left: 0; right: 0; top: 74%; border-top: 1px dashed rgba(88, 214, 255, 0.45); }
.mo-aim .mo-dot { position: absolute; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 50%;
  background: #ff8a5a; box-shadow: 0 0 8px #ff6a3a; left: 50%; top: 50%; }
.mo-aim b { position: absolute; left: 0; right: 0; bottom: 3px; font-size: 0.62rem; text-align: center;
  color: #dff6ff; opacity: 0.7; letter-spacing: 0.04em; pointer-events: none; }
@media (max-width: 640px) {
  .mo-aim { width: 58px; min-width: 58px; min-height: 46px; }
  .mo-bar { bottom: 150px; gap: 4px; padding: 5px; flex-wrap: wrap; justify-content: center; width: max-content; max-width: calc(100vw - 32px); }
  .mo-key { min-width: 54px; padding: 6px 5px 7px; }
  .mo-key b { font-size: 0.8rem; }
  .mo-key span { font-size: 0.62rem; }
  .mo-key kbd { display: none; }
}`;

export class MonsterBar {
  /**
   * `order` sends her an order; `aim(x, y)`, when given, turns her head for
   * her jaws (x -1 her left to 1 her right, y -1 low to 1 high) -- the pad
   * on the bar is the same thing as the arrow keys.
   */
  constructor(parent, order, aim = null) {
    if (!document.getElementById('mo-bar-css')) {
      const st = document.createElement('style');
      st.id = 'mo-bar-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.el = document.createElement('div');
    this.el.className = 'mo-bar';
    this.el.hidden = true;
    this.el.innerHTML = '<div class="mo-hp"><i></i></div>';
    this.keys = {};
    const key = (k, label, hot, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mo-key';
      b.innerHTML = `<kbd>${hot}</kbd><b>${label}</b><span></span><i class="mo-fill"></i>`;
      // Pressed with a finger or a mouse, and never the battle's own click
      // through to the sea under it.
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      this.el.appendChild(b);
      this.keys[k] = b;
    };
    key('breath', 'Atomic Breath', 'F', () => order({ a: 'breath' }));
    key('tail', 'Tail', 'T', () => order({ a: 'tail' }));
    key('grab', 'Grab', 'G', () => order({ a: this.holding ? 'throw' : 'grab' }));
    key('pose', 'Swimming', 'X', () => order({ a: 'pose', pose: { deep: 'swim', swim: 'stand', stand: 'deep' }[this.pose || 'swim'] }));
    key('crush', 'Crush', 'C', () => order({ a: 'crush' }));
    key('bite', 'Bite', 'B', () => order({ a: 'bite' }));
    key('roar', 'Roar', 'R', () => order({ a: 'roar' }));
    // Where her jaws go in: a little picture of a hull side-on, and a dot on
    // it where her head is turned. Drag on it, or use the arrow keys.
    this.pad = document.createElement('div');
    this.pad.className = 'mo-aim';
    this.pad.title = 'Where her jaws go in: arrow keys, or drag here';
    this.pad.innerHTML = '<div class="mo-sea"></div><div class="mo-ship"></div><i class="mo-dot"></i><b>Jaws ←↑↓→</b>';
    this.dot = this.pad.querySelector('.mo-dot');
    const fromPointer = (e) => {
      const r = this.pad.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 2 - 1;
      const y = 1 - ((e.clientY - r.top) / r.height) * 2;
      if (aim) aim(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)));
    };
    this.pad.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      try { this.pad.setPointerCapture(e.pointerId); } catch { /* fine */ }
      this.dragging = true;
      fromPointer(e);
    });
    this.pad.addEventListener('pointermove', (e) => { if (this.dragging) { e.stopPropagation(); fromPointer(e); } });
    const end = (e) => { this.dragging = false; e.stopPropagation(); };
    this.pad.addEventListener('pointerup', end);
    this.pad.addEventListener('pointercancel', end);
    this.pad.addEventListener('click', (e) => e.stopPropagation());
    this.el.appendChild(this.pad);
    // Fold it away, and back.
    this.fold = document.createElement('button');
    this.fold.type = 'button';
    this.fold.className = 'mo-fold';
    this.fold.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
    this.fold.addEventListener('click', (e) => { e.stopPropagation(); this.toggleHidden(); });
    this.el.appendChild(this.fold);
    let folded = false;
    try { folded = localStorage.getItem('sc.moBarFolded') === '1'; } catch { /* no storage */ }
    this.setFolded(folded);
    parent.appendChild(this.el);
    this.seen = 0;
    this.timer = setInterval(() => { if (performance.now() - this.seen > 500) this.el.hidden = true; }, 250);
  }

  /**
   * Where her head is turned for her jaws, on the pad: the captain's own aim
   * as he moves it (`a`), and lit while her jaws are in a ship or one is in
   * her hands.
   */
  showAim(a, live = false) {
    if (!a) return;
    const left = `${50 + a.x * 42}%`, top = `${50 - a.y * 40}%`;
    if (this.dot.style.left !== left) this.dot.style.left = left;
    if (this.dot.style.top !== top) this.dot.style.top = top;
    this.pad.classList.toggle('live', live);
  }

  /** Fold the bar away to a tab, or open it again. */
  toggleHidden() { this.setFolded(!this.folded); }

  setFolded(on) {
    this.folded = !!on;
    this.el.classList.toggle('folded', this.folded);
    this.fold.textContent = this.folded ? 'Monster One ▴' : '▾';
    this.fold.title = this.folded ? 'Show Monster One\'s controls (`)' : 'Hide these controls (`)';
    try { localStorage.setItem('sc.moBarFolded', this.folded ? '1' : '0'); } catch { /* no storage */ }
  }

  /** `w` is her wire, read (see readMonsterWire); `s` her snapshot. */
  update(w, s) {
    this.seen = performance.now();
    this.el.hidden = !s.a;
    if (!s.a) return;
    this.pose = w.pose;
    this.holding = !!w.holdId;
    const set = (k, sub, { wait = false, live = false, fill = 0, label = null } = {}) => {
      const b = this.keys[k];
      if (label != null && b.querySelector('b').textContent !== label) b.querySelector('b').textContent = label;
      const span = b.querySelector('span');
      if (span.textContent !== sub) span.textContent = sub;
      b.classList.toggle('wait', wait);
      b.classList.toggle('live', live);
      b.querySelector('.mo-fill').style.width = `${Math.round(fill * 100)}%`;
    };
    const B = MONSTER.breath;
    if (w.act === 'charge') set('breath', `Charging ${Math.round(w.charge * 100)}%`, { live: true, fill: w.actT / (B.climb + B.throat) });
    else if (w.act === 'fire') set('breath', 'Firing', { live: true, fill: 1 });
    else if (w.cool > 0) set('breath', `Ready in ${fmt(w.cool)}`, { wait: true, fill: 1 - w.cool / B.cooldown });
    else set('breath', `Ready · ${B.kt} kt`, { fill: 1 });
    // Ships marked for it with the Attack key, waiting their turn.
    const nm = (w.marks || []).length;
    if (nm && w.act !== 'charge' && w.act !== 'fire') {
      const span = this.keys.breath.querySelector('span');
      const t = `${span.textContent} · ${nm} marked`;
      if (span.textContent !== t) span.textContent = t;
    }
    set('tail', w.act === 'tail' ? 'Swinging' : w.tailCool > 0 ? `${w.tailCool}s` : w.pose === 'deep' ? 'Surface first' : 'Ready',
      { wait: w.tailCool > 0 || w.pose === 'deep', live: w.act === 'tail' });
    // A small ship in her hands is thrown; a big one held down is let go.
    if (w.holdId && w.pin) set('grab', 'Too big to lift', { live: true, label: 'Let go' });
    else if (w.holdId) set('grab', 'Throw it', { live: true, label: 'Throw' });
    else set('grab', w.act === 'reach' ? 'Reaching' : w.grabCool > 0 ? `${w.grabCool}s` : 'Arm\'s length',
      { wait: w.grabCool > 0, live: w.act === 'reach', label: 'Grab' });
    const POSE = { deep: ['Deep', 'Surface ↑'], swim: ['Swimming', 'Stand ↑'], stand: ['Standing', 'Dive ↓'] }[w.pose] || ['Swimming', ''];
    if (w.ashore) set('pose', 'On land', { label: 'Walking', wait: true });
    else set('pose', POSE[1], { label: POSE[0] });
    set('crush', w.act === 'crush' ? 'Crushing' : !w.holdId ? 'Grab first' : w.crushCool > 0 ? `${w.crushCool}s` : 'Ready',
      { wait: !w.holdId || w.crushCool > 0, live: w.act === 'crush' });
    set('bite', w.act === 'bite' ? 'Biting' : w.biteCool > 0 ? `${w.biteCool}s` : w.holdId ? 'Ship in hands' : 'Ship ahead',
      { wait: w.biteCool > 0, live: w.act === 'bite' });
    set('roar', w.act === 'roar' ? 'Roaring' : '', { live: w.act === 'roar' });
    this.showAim(this.aimNow || w.aim, w.act === 'bite' || !!w.holdId);
    const hp = this.el.querySelector('.mo-hp i');
    const frac = s.hp != null ? s.hp / (s.mhp || getClass(s.c).hp) : null;
    if (frac != null) hp.style.width = `${Math.round(frac * 100)}%`;
  }
}

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}
