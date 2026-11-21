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

/**
 * The same, but the gzipped strings written as a file of their own beside
 * the module (`bin`, its name) rather than base64 inside it: a third smaller
 * again, which is what the published page needs to fit its host. The module
 * fetches it from beside itself. `{ module, bytes }`; `bytes` null where the
 * module had nothing worth packing.
 */
export function packDataFile(src, bin, { shuffle = false } = {}) {
  const strings = [];
  const body = replaceLong(src, (s) => `__z[${strings.push(s) - 1}]`);
  if (!strings.length) return { module: src, bytes: null };
  let bytes = zlib.gzipSync(Buffer.from(strings.join(',')), { level: 9 });
  if (shuffle) {
    const tight = shuffled(strings);
    if (tight && tight.length < bytes.length) bytes = tight;
  }
  if (bytes.length > src.length * 0.9) return { module: src, bytes: null };
  const module = `import { unpackFile } from './unpack.js';\nconst __z = await unpackFile(new URL('./${bin}', import.meta.url));\n${body}`;
  return { module, bytes };
}

/**
 * The strings packed tighter, for the biggest hulls: each as the bytes its
 * base64 stands for, regrouped by their place in each value (every first
 * byte, then every second ...) and written as differences, whichever of a
 * few groupings gzip likes best; gzipped as one behind a mark unpack.js
 * knows (client/js/unpack.js, unshuffled). Null if any string is not plain
 * base64 that comes back exactly as it was.
 */
const MARK = Buffer.from([0, 83, 67, 49]);
function regroup(b, k) {
  if (k <= 1) return b;
  const o = Buffer.alloc(b.length);
  const whole = Math.floor(b.length / k) * k;
  let j = 0;
  for (let q = 0; q < k; q++) for (let i = q; i < whole; i += k) o[j++] = b[i];
  for (let i = whole; i < b.length; i++) o[j++] = b[i];
  return o;
}
function differences(b) {
  const o = Buffer.alloc(b.length);
  let prev = 0;
  for (let i = 0; i < b.length; i++) { o[i] = (b[i] - prev) & 255; prev = b[i]; }
  return o;
}
export function shuffled(strings) {
  const heads = [], parts = [];
  for (const s of strings) {
    const b = Buffer.from(s, 'base64');
    if (b.toString('base64') !== s) return null;
    let best = null;
    for (const k of [1, 2, 3, 4, 6, 8, 12]) {
      for (const d of [0, 1]) {
        const x = d ? differences(regroup(b, k)) : regroup(b, k);
        const size = zlib.deflateRawSync(x, { level: 6 }).length;
        if (!best || size < best.size) best = { k, d, x, size };
      }
    }
    const h = Buffer.alloc(6);
    h[0] = best.k; h[1] = best.d; h.writeUInt32LE(best.x.length, 2);
    heads.push(h);
    parts.push(best.x);
  }
  const n = Buffer.alloc(4);
  n.writeUInt32LE(strings.length, 0);
  return zlib.gzipSync(Buffer.concat([MARK, n, ...heads, ...parts]), { level: 9 });
}
