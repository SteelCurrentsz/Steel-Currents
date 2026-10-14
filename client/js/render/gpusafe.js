// What the battle leaves out on a device whose graphics have been lost.
//
// An iPad has taken the battle's graphics away -- and on one, the whole
// page's -- a few seconds after the first shells landed, and nothing here can
// see why: the same battle in any other browser holds steady. So each time it
// happens the device steps down one more level, and stays there for a week,
// until a battle holds: see stepDown in main.js.
//
//   1  no antialiasing, a drawn pixel to a screen pixel, holes cut out of
//      her plating rather than in the shader
//   2  and no dents or scrapes where shells strike, no shriek of shells going
//      over, and fewer drawn pixels still
//   3  and the low quality setting
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
