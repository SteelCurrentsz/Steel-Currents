// A battle played back off its recording.
//
// The battle view cannot tell a live room from this: it is handed the same
// messages, in the same order, through the same `on` and `send` that
// `LocalNet` gives it (see localnet.js). The difference is that the clock is
// ours. Played back, the battle can be run slow, stopped dead, run on ahead
// and wound back to any moment of it -- which is what a replay is for when the
// point of the battle was to be filmed.
//
// A recording is the text of every message the room sent, kept as text (see
// LocalNet.record). Each one is read the moment it is needed and not before,
// so a quarter of an hour of battle costs its text and nothing else.

import { DT } from '../../shared/sim.js';

/** How often the playback looks for messages that are due, a second. */
const PUMP_HZ = 60;

/** The speeds a replay may be run at. Nought is stopped. */
export const REPLAY_SPEEDS = [0, 0.25, 0.5, 1, 2, 4];

export class ReplayNet extends EventTarget {
  constructor(rec) {
    super();
    this.rec = rec;
    this.connected = true;
    this.ping = 0;
    // Where each snapshot is in the recording and what moment of the battle
    // it is a picture of, read off the head of its text without parsing the
    // whole of it. Everything else in the recording happens at the moment of
    // the snapshot before it.
    this.marks = [];
    const tickOf = /^\{"t":"snap","tick":(\d+)/;
    rec.frames.forEach((text, i) => {
      const m = tickOf.exec(text.slice(0, 40));
      if (m) this.marks.push({ i, t: Number(m[1]) * DT });
    });
    this.start = this.marks.length ? this.marks[0].t : 0;
    this.end = this.marks.length ? this.marks[this.marks.length - 1].t : 0;
    this.cursor = 0;
    this.t = this.start;
    this.rate = 1;
    this.timer = null;
    this.wallAt = 0;
  }

  get length() { return Math.max(0, this.end - this.start); }

  /** Where the playback has got to, in seconds from the first shot of it. */
  get at() { return this.t - this.start; }

  on(type, fn) {
    const h = (e) => fn(e.detail);
    this.addEventListener(type, h);
    return () => this.removeEventListener(type, h);
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  deliver(msg) {
    this.emit(msg.t, msg);
    this.emit('*', msg);
  }

  /** Begin playing from the start. */
  play() {
    this.stop();
    this.wallAt = performance.now();
    this.timer = setInterval(() => this.pump(), 1000 / PUMP_HZ);
    this.pump();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Everything that has come due since the last look, in the order it happened. */
  pump() {
    const now = performance.now();
    const wall = Math.min(0.25, Math.max(0, (now - this.wallAt) / 1000));
    this.wallAt = now;
    this.t = Math.min(this.end, this.t + wall * this.rate);
    const frames = this.rec.frames;
    while (this.cursor < frames.length) {
      const text = frames[this.cursor];
      if (text.startsWith('{"t":"snap"')) {
        const m = /"tick":(\d+)/.exec(text.slice(0, 40));
        if (m && Number(m[1]) * DT > this.t + 1e-6) break;
      }
      this.cursor++;
      this.send1(text);
    }
    // At the end it stops, rather than running a clock past the last picture
    // there is.
    if (this.t >= this.end && this.rate > 0 && this.cursor >= frames.length) this.setRate(0);
  }

  send1(text) {
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    // What the speed was when it was recorded is nothing to the playback: the
    // speed it is played at is the viewer's.
    if (msg.t === 'warp') return;
    this.deliver(msg);
  }

  setRate(s) {
    const r = REPLAY_SPEEDS.includes(s) ? s : 1;
    this.rate = r;
    this.deliver({ t: 'warp', s: r });
  }

  /**
   * Go to a moment of the battle. The picture is put back to the snapshot at
   * or before it and runs on from there; whatever happened in between is not
   * replayed, so nothing that was skipped goes off on the way past.
   */
  seek(at) {
    const want = Math.min(this.end, Math.max(this.start, this.start + at));
    let k = 0;
    for (let j = 0; j < this.marks.length; j++) {
      if (this.marks[j].t <= want) k = j; else break;
    }
    const mark = this.marks[k];
    if (!mark) return;
    this.cursor = mark.i;
    this.t = mark.t;
    this.wallAt = performance.now();
    this.send1(this.rec.frames[this.cursor++]);
  }

  // -- what the battle view asks of a room -------------------------------------

  send(msg) {
    if (!msg) return;
    if (msg.t === 'warp') this.setRate(Number(msg.s));
    else if (msg.t === 'leave') { this.stop(); this.deliver({ t: 'left' }); }
    // Everything else is an order, and nobody in a recording takes orders.
  }
}
