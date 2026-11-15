// The light cruiser Cesare Borgia's hull and superstructure: the owner's model
// of her, painted in the colours it was textured in -- her grey and her
// forecastle's and quarterdeck's red and white stripes -- and her guns -- her
// 152 mm triples, her 75 mm dual-purpose guns, her 37 mm twins and her banks
// of tubes -- as the model drew each.
//
// build/prepare-borgia-hull.mjs reads the model as the owner uploaded it --
// "Italian Light Cruiser Cesare Borgia(Plan B) -T10" by 全斗焕
// (https://skfb.ly/prA87), under Creative Commons Attribution 4.0, credited
// on the Credits screen -- brings it up to her size, paints every face the
// colour of the texture under it, paints her bottom one colour under her
// waterline, lifts her guns, her tubes and her screws out of her mounting by
// mounting, and keeps every triangle of what is left.
//
// She is drawn in three surfaces, each with the texture of what it is: her
// plating in the fleet's steel plate, her decks in planking, and the plates
// the model drew as single sheets from both sides, all over her own colours.
import { SHIP_BORGIA as SHIP } from './borgia.js';
export { faceProjected, texturedMaterials as borgiaMaterials } from './texturedShip.js';

/** Height of her surface at (x, z), or -99 off her. */
export const borgiaSurfaceY = (x, z) => SHIP.surfaceY(x, z);
/** Where a mounting stands, at (x, z): the median of her surface round it. */
export const borgiaSeatY = (x, z) => SHIP.seatY(x, z);
/** Where every one of her mountings stands: see build/prepare-borgia-hull.mjs. */
export const MOUNT_SEATS = SHIP.MOUNT_SEATS;
/** Her lines, as the model has them: what her interior and armour are fitted under. */
export const SCULPT_LINES = SHIP.SCULPT_LINES;
/** Add the model's hull, painted and textured, as its length-wise slices. */
export const buildBorgiaHull = (g) => SHIP.buildHull(g);
/** One of her guns as the model drew it, in the frame of its mounting. */
export const gunPiece = (kind) => SHIP.gunPiece(kind);
