// Shaders compiled ahead of time, finished ahead of time.
//
// Everything in a battle that is not on the screen from the start -- an
// atomic burst's cloud and mist, a ship's plating as it is drawn once a blast
// has charred her or torn her open, the pools of fire and smoke -- has its
// shaders compiled while nothing is happening (warmScene in main.js,
// Scene.warmCuts, Nukes.warm). But a compiled program is not a finished one.
// Where the graphics driver can link programs on threads of its own
// (KHR_parallel_shader_compile) it does so in the background; where it cannot
// -- every browser on an iPhone or an iPad, and plenty of others -- the link
// is put off until the program is first drawn with, and it is the link that
// takes the time. So all of that work landed in the one frame it was first
// wanted: an atomic bomb going off over the captain's own ship linked its
// cloud, its mist and the charred and torn plating of every ship round her
// in the instant of the flash, seconds of a frozen screen at exactly the
// moment worth watching.
//
// Here the programs the renderer has that nothing has drawn with yet are
// finished one a frame, while the battle is quiet, so that what is wanted in
// the middle of an action is already done.
const done = new WeakSet();

/**
 * Finish (link) one of `renderer`'s programs that has not been drawn with yet,
 * if there is one ready to be. Cheap when there is nothing to do; when there
 * is, it costs at most one program's link this frame. A program the driver is
 * still building on its own threads is left to it: asking for it now would
 * wait for it.
 */
export function linkPending(renderer) {
  const programs = renderer?.info?.programs;
  if (!programs || !programs.length) return;
  const t0 = performance.now();
  for (const p of programs) {
    if (done.has(p)) continue;
    if (typeof p.isReady === 'function' && !p.isReady()) continue;
    done.add(p);
    // One that has been drawn with already is finished, and this costs
    // nothing; one that has not is linked now, and that is this frame's.
    try { p.getUniforms(); } catch { /* reported when it is drawn with */ }
    if (performance.now() - t0 > 2) return;
  }
}
