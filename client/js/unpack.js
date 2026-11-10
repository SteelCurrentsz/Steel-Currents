/**
 * The ships' data, unpacked as it arrives.
 *
 * A hull is several megabytes of base64 -- her points, her paint, her guns --
 * and base64 is a third bigger than what it carries and a good deal bigger
 * than it need be: on a slow line a battle's three ships were the best part
 * of twenty megabytes before she could put to sea. So the published build
 * gzips every long string of a data file into one and ships that
 * (build/pack-data.mjs); the module waits here for it to be opened and then
 * hands the game exactly the strings it had before.
 *
 * The browser opens it (DecompressionStream) where it can; where it cannot --
 * a browser from before 2023 -- it is opened here, by hand.
 */

/** The strings `packed` holds, in the order they were packed. */
export async function unpack(packed) {
  const bytes = fromBase64(packed);
  let text;
  if (typeof DecompressionStream === 'function') {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      text = await new Response(stream).text();
    } catch { /* opened by hand below */ }
  }
  if (text === undefined) text = new TextDecoder().decode(gunzip(bytes));
  return text.split(',');
}

function fromBase64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---- inflate, for a browser without DecompressionStream --------------------
const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073,
  4097, 6145, 8193, 12289, 16385, 24577];
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/** A gzip member's contents: its header skipped, its body inflated. */
export function gunzip(src) {
  if (src[0] !== 0x1f || src[1] !== 0x8b || src[2] !== 8) throw new Error('Steel Currents: not a gzip stream');
  const flags = src[3];
  let p = 10;
  if (flags & 4) p += 2 + (src[p] | (src[p + 1] << 8));
  if (flags & 8) while (src[p++]);
  if (flags & 16) while (src[p++]);
  if (flags & 2) p += 2;
  return inflateRaw(src, p);
}

/** Raw deflate, after zlib's puff: slow and small, and only ever the fallback. */
export function inflateRaw(src, start = 0) {
  let out = new Uint8Array(Math.max(1024, src.length * 4));
  let n = 0, pos = start, bit = 0;
  const room = (k) => {
    if (n + k <= out.length) return;
    let len = out.length * 2;
    while (len < n + k) len *= 2;
    const o = new Uint8Array(len);
    o.set(out.subarray(0, n));
    out = o;
  };
  const bits = (k) => {
    let v = 0;
    for (let i = 0; i < k; i++) {
      if (pos >= src.length) throw new Error('Steel Currents: the packed data ran short');
      v |= ((src[pos] >> bit) & 1) << i;
      if (++bit === 8) { bit = 0; pos++; }
    }
    return v;
  };
  const table = (lens) => {
    const count = new Uint16Array(16), offs = new Uint16Array(16), sym = new Uint16Array(lens.length);
    for (const l of lens) count[l]++;
    count[0] = 0;
    for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + count[i - 1];
    for (let s = 0; s < lens.length; s++) if (lens[s]) sym[offs[lens[s]]++] = s;
    return { count, sym };
  };
  const decode = (h) => {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len < 16; len++) {
      code |= bits(1);
      const c = h.count[len];
      if (code - c < first) return h.sym[index + (code - first)];
      index += c; first += c; first <<= 1; code <<= 1;
    }
    throw new Error('Steel Currents: the packed data is corrupt');
  };
  let fixed = null;
  for (let last = 0; !last;) {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      if (bit) { bit = 0; pos++; }
      const len = src[pos] | (src[pos + 1] << 8);
      pos += 4;
      room(len);
      out.set(src.subarray(pos, pos + len), n);
      n += len; pos += len;
      continue;
    }
    let lit, dist;
    if (type === 1) {
      if (!fixed) {
        const l = new Uint8Array(288);
        l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288);
        fixed = { lit: table(l), dist: table(new Uint8Array(30).fill(5)) };
      }
      ({ lit, dist } = fixed);
    } else if (type === 2) {
      const nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4;
      const cl = new Uint8Array(19);
      for (let i = 0; i < ncode; i++) cl[ORDER[i]] = bits(3);
      const ct = table(cl);
      const lens = new Uint8Array(nlen + ndist);
      for (let i = 0; i < nlen + ndist;) {
        const s = decode(ct);
        if (s < 16) { lens[i++] = s; continue; }
        let rep = 0, v = 0;
        if (s === 16) { v = lens[i - 1]; rep = 3 + bits(2); } else if (s === 17) rep = 3 + bits(3); else rep = 11 + bits(7);
        while (rep--) lens[i++] = v;
      }
      lit = table(lens.subarray(0, nlen));
      dist = table(lens.subarray(nlen));
    } else throw new Error('Steel Currents: the packed data is corrupt');
    for (;;) {
      const s = decode(lit);
      if (s < 256) { room(1); out[n++] = s; continue; }
      if (s === 256) break;
      const len = LBASE[s - 257] + bits(LEXT[s - 257]);
      const ds = decode(dist);
      const d = DBASE[ds] + bits(DEXT[ds]);
      room(len);
      for (let i = 0; i < len; i++, n++) out[n] = out[n - d];
    }
  }
  return out.subarray(0, n);
}
