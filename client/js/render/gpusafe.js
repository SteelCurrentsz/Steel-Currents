// What the battle leaves out on a device whose graphics have been lost.
//
// An iPad has taken the battle's graphics away -- and on one, the whole
// page's -- a few seconds after the first shells landed, and nothing here can
// see why: the same battle in any other browser holds steady. So each time it
// happens the device steps down one more level, and stays there for a week,
// until a battle holds: see goSafe in main.js.
//
//   1  holes cut out of her plating rather than in the shader
//   2  and no dents or scrapes where shells strike, no shriek of shells going
//      over, and no antialiasing
//   3  and the low quality setting, at one drawn pixel to a screen pixel
//
// What a player sees as a sharp picture -- full resolution, antialiased --
// goes last: dropped first, it made the game look pixelated for a week on a
// device that was already well again.
export const GPU = {
  level: 0,
  holeShader: true,
  marks: true,
  whistles: true,
};

export function setGpuLevel(level) {
  GPU.level = level;
  GPU.holeShader = level < 1;
  GPU.marks = level < 2;
  GPU.whistles = level < 2;
}
