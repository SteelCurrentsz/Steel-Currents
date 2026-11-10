// The ships' data files, packed for the published build (see client/js/unpack.js).
//
// Every long base64 string in a data module -- a hull, a gun, a sculpted
// aeroplane -- is joined with the rest and gzipped as one, and the module
// is written again to wait for that to be opened and export the same values
// it always did: the game reads them exactly as before.
import zlib from 'node:zlib';

// A quoted run of base64 at least this long is packed.
const MIN = 256;
const B64 = new Uint8Array(128);
for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=') B64[c.charCodeAt(0)] = 1;

// `src` with each long quoted base64 string replaced by `fn(string)`, quotes
// and all. Scanned by hand: a regular expression over a string of several
// megabytes runs out of stack.
function replaceLong(src, fn) {
  let out = '', from = 0, i = src.indexOf('"');
  while (i !== -1) {
    let j = i + 1;
    while (j < src.length && B64[src.charCodeAt(j)]) j++;
    if (src[j] === '"' && j - i - 1 >= MIN) {
      out += src.slice(from, i) + fn(src.slice(i + 1, j));
      from = j + 1;
      i = src.indexOf('"', from);
    } else {
      i = src.indexOf('"', i + 1);
    }
  }
  return out + src.slice(from);
}

/** The module `src`, its long strings packed; or `src` itself if it has none. */
export function packData(src) {
  const strings = [];
  const body = replaceLong(src, (s) => `__z[${strings.push(s) - 1}]`);
  if (!strings.length) return src;
  const packed = zlib.gzipSync(Buffer.from(strings.join(',')), { level: 9 }).toString('base64');
  const out = `import { unpack } from './unpack.js';\nconst __z = await unpack("${packed}");\n${body}`;
  // What is already squeezed packs to
  // nearly what it was, and is left as it is rather than opened for nothing.
  return out.length < src.length * 0.9 ? out : src;
}
