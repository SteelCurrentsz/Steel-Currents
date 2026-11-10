// The battle, hosted on a thread of its own.
//
// A battle on this device is a Room run in the page (see localnet.js), and
// for as long as it was run in the page it was run on the same thread as the
// drawing: thirty steps of the whole simulation a second, every snapshot
// built and every event sorted, each one landing in the middle of somebody's
// frame. In a fleet action that was a tenth of the thread, and when an
// atomic bomb or a broadside of magazines went up, the tick that worked it
// out was a dropped frame of its own. Here it runs beside the drawing rather
// than in front of it.
//
// What crosses between the two is exactly what would cross a socket: the
// captain's orders one way, the room's messages the other. The recording for
// the replay is made here, where the room is, and handed across in batches.
import { LocalNet } from './localnet.js';

// The page's heartbeat. A battle hosted in the page could only run while the
// page did: a frame that stalled for a second -- the fleet being built behind
// the loading screen, the tab put away -- held the battle with it. A battle
// on its own thread would sail straight on through, and a captain would come
// back from the loading screen to find himself already under fire. So the
// room is stepped only while the page is drawing.
let beat = Date.now();
const STALL = 300;

const host = new LocalNet({ worker: false });
host.deliver = (msg) => {
  if (msg.t === 'pong') return;
  try {
    self.postMessage({ k: 'msg', msg });
  } catch {
    // Whatever cannot be copied across as it stands goes as it would down a
    // socket.
    self.postMessage({ k: 'msg', msg: JSON.parse(JSON.stringify(msg)) });
  }
};
// A handle for the console, like window.__battle on the page.
self.__host = host;

// The recording, handed across as it is made: a batch at a time, not a
// message apiece.
let sent = null;
let batch = [];
let flushAt = 0;
function flush() {
  flushAt = 0;
  const rec = host.recording;
  if (!rec) return;
  const start = sent !== rec ? { title: rec.title, joined: rec.joined } : null;
  sent = rec;
  self.postMessage({ k: 'rec', start, frames: batch, size: rec.size, full: rec.full, end: rec.end });
  batch = [];
}

const record = host.record.bind(host);
host.record = (room, joined, title) => {
  record(room, joined, title);
  const keep = room.recorder;
  const rec = host.recording;
  room.recorder = (msg) => {
    const n = rec.frames.length;
    keep(msg);
    // Only what is new, and the store here is not kept twice: the page holds
    // the replay, this side only passes it on.
    if (rec.frames.length > n) batch.push(...rec.frames.splice(n));
    if (!flushAt) flushAt = setTimeout(flush, 0);
  };
  // A new battle's recording starts from nothing.
  sent = null;
  batch = [];
  flush();
};

// Each room's clock, held while the page is not drawing.
const startBattle = host.startBattle.bind(host);
host.startBattle = (msg, opts) => {
  startBattle(msg, opts);
  const room = host.room;
  if (!room) return;
  const tick = room.tick.bind(room);
  room.tick = () => {
    if (Date.now() - beat > STALL) { room.lastTick = Date.now(); return; }
    tick();
  };
};

self.onmessage = (e) => {
  const d = e.data;
  if (!d) return;
  if (d.k === 'beat') { beat = Date.now(); return; }
  if (d.k === 'send') {
    beat = Date.now();
    host.send(d.msg);
  }
};

host.connect = () => {};
self.postMessage({ k: 'ready' });
