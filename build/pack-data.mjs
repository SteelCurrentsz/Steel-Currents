// The ships' data files, packed for the published build (see client/js/unpack.js).
//
// Every long base64 string in a data module -- a hull, a gun, a sculpted
// aeroplane -- is joined with the rest and gzipped as one, and the module
// is written again to wait for that to be opened and export the same values
// it always did: the game reads them exactly as before.
import zlib from 'node:zlib';

const LONG = /"([A-Za-z0-9+/=]{256,})"/g;

/** The module `src`, its long strings packed; or `src` itself if it has none. */
export function packData(src) {
  const strings = [];
  const body = src.replace(LONG, (_, s) => `__z[${strings.push(s) - 1}]`);
  if (!strings.length) return src;
  const packed = zlib.gzipSync(Buffer.from(strings.join(',')), { level: 9 }).toString('base64');
  const out = `import { unpack } from './unpack.js';\nconst __z = await unpack("${packed}");\n${body}`;
  // What is already squeezed -- the voices are compressed audio -- packs to
  // nearly what it was, and is left as it is rather than opened for nothing.
  return out.length < src.length * 0.9 ? out : src;
}
