// Nothing new is drawn before its shader is ready.
//
// Some of what a battle draws is only made in the middle of it: the inside
// of a hull the moment she is first opened, the torn faces round a rent, the
// cracks Monster One's claws run through her plating, the very piece her jaws
// tear out. Each is drawn with a material the picture may not have built a
// shader for yet, and a shader built in the frame it is first wanted holds
// that whole frame up until the graphics driver has finished with it -- a
// quarter of a second on a phone, more on a slow one, and in the middle of
// her crushing a ship, which is when it is noticed.
//
// So a thing made mid-battle is handed in here as it is made. Its shaders
// are started straight away and finished in the background (KHR_parallel_
// shader_compile, where the browser has it), and the thing is kept out of the
// picture for the frame or two that takes, rather than the picture waiting
// for it. Anything whose shaders are already built is shown as it is.
//
// Everything handed in during one piece of work is compiled together, once:
// compiling walks the whole battle for its lights, and opening a hull hands
// in a lining for every plate of her at once.

let R = null, CAM = null, SCENE = null;
let queue = [];
let due = false;

/** The battle's renderer, camera and scene: what everything is compiled for. */
export function bindWarm(renderer, camera, scene) {
  R = renderer; CAM = camera; SCENE = scene;
  queue = [];
}

/** Let go of the battle that is over. */
export function unbindWarm(scene) {
  if (scene && scene !== SCENE) return;
  R = null; CAM = null; SCENE = null;
  queue = [];
}

function materialsOf(obj, out) {
  obj.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m) out.add(m);
  });
  return out;
}

function ready(mats) {
  for (const m of mats) {
    const p = R.properties.get(m).currentProgram;
    if (p && typeof p.isReady === 'function' && !p.isReady()) return false;
  }
  return true;
}

function flush() {
  due = false;
  const list = queue;
  queue = [];
  if (!R || !list.length) return;
  // Only what is still in the battle.
  const objs = list.filter((o) => o.parent);
  if (!objs.length) return;
  // One root for the lot: all the compiler asks of it is to be walked.
  const root = {
    traverse(cb) { for (const o of objs) o.traverse(cb); },
    traverseVisible(cb) { for (const o of objs) o.traverseVisible(cb); },
  };
  let pending = null;
  try { pending = R.compileAsync(root, CAM, SCENE); } catch { return; }
  if (!pending || typeof pending.then !== 'function') return;
  // Whatever was ready the moment it was compiled is drawn now; the rest is
  // held back until all of it is.
  const waiting = [];
  for (const o of objs) {
    let ok = true;
    try { ok = ready(materialsOf(o, new Set())); } catch { ok = true; }
    if (ok || !o.visible) continue;
    o.visible = false;
    o.userData.warming = true;
    waiting.push(o);
  }
  const show = () => {
    for (const o of waiting) {
      if (!o.userData.warming) continue;
      o.userData.warming = false;
      o.visible = true;
    }
  };
  pending.then(show, show);
}

/**
 * `obj`'s shaders started for the battle's picture, and `obj` kept hidden
 * until it can be drawn without a stall. Returns `obj`. Safe with no battle
 * bound: it is then drawn when it is first wanted, as before.
 */
export function showWhenReady(obj) {
  if (!R || !CAM || !SCENE || !obj || typeof R.compileAsync !== 'function') return obj;
  queue.push(obj);
  if (!due) {
    due = true;
    // Before the next frame is drawn, and after everything else this piece
    // of work makes has been handed in.
    Promise.resolve().then(flush);
  }
  return obj;
}

/** `obj` is not to be shown after all: it was hidden for good while it was warming. */
export function cancelWarm(obj) {
  if (obj && obj.userData) obj.userData.warming = false;
}
