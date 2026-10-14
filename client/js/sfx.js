// The noises of a sea fight, worked out sample by sample.
//
// Nothing here is a recording and nothing is downloaded: every sound is built
// from noise and a few resonances the way the real one is made. A heavy gun is
// a pressure front -- the crack of it -- with a great deal of hot gas behind it
// and then the long roll of that going away across the water. A shell into the
// sea is a slap, a rush of spray going up and, seconds later, tons of it coming
// down again. Armour that turned a round away rings like the plate it is. A
// hull going under creaks, because steel loaded past what it was built for
// slips against itself a little at a time, and every slip sets the plating
// ringing.
//
// Every maker takes a sample rate and a seeded random source and hands back
// one Float32Array a channel, so the same seed always makes the same sound and
// a few seeds make a few takes of it. audio.js turns these into buffers and
// puts them where they happened.

// All of it is inside the one function so that it can be handed to a worker as
// it stands -- its source is the whole of it, whatever the bundler has called
// things -- and the battle never waits on a sound being built.
export function sfxKit() {
  /** A seeded random source: the same seed, the same take. */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const TAU = Math.PI * 2;

  /**
   * A state-variable filter whose cutoff may move every sample: what a blast
   * sounds like is mostly how fast its brightness goes out of it. `mode` is
   * 'low', 'band' or 'high'.
   */
  function svf(sr, mode = 'low') {
    // The trapezoidal form, which is stable at any cutoff and any Q -- the
    // old textbook one blew up whenever a broad filter was swept high.
    let ic1 = 0, ic2 = 0;
    const top = sr * 0.45;
    const k0 = Math.PI / sr;
    let lastFc = -1, lastQ = -1, a1 = 0, a2 = 0, a3 = 0, damp = 1.4;
    const m = mode === 'low' ? 0 : mode === 'band' ? 1 : 2;
    return (x, fc, q = 0.707) => {
      // Worked out again only when the cutoff has moved: a tangent a sample,
      // for every filter in every take, was most of the cost.
      if (fc !== lastFc || q !== lastQ) {
        lastFc = fc; lastQ = q;
        const w = k0 * (fc < 10 ? 10 : fc > top ? top : fc);
        const w2 = w * w;
        const g = w * (1 + w2 * (1 / 3 + w2 * (2 / 15 + w2 * 17 / 315)));
        damp = 1 / (q < 0.5 ? 0.5 : q);
        a1 = 1 / (1 + g * (g + damp)); a2 = g * a1; a3 = g * a2;
      }
      const v3 = x - ic2;
      const v1 = a1 * ic1 + a2 * v3;
      const v2 = ic2 + a2 * ic1 + a3 * v3;
      ic1 = 2 * v1 - ic1;
      ic2 = 2 * v2 - ic2;
      return m === 0 ? v2 : m === 1 ? v1 : x - damp * v1 - v2;
    };
  }

  /** A two-pole resonance ringing at `f` for about `tau` seconds. */
  function resonator(sr, f, tau) {
    const r = Math.exp(-1 / (Math.max(0.002, tau) * sr));
    const c = 2 * r * Math.cos(TAU * Math.min(f, sr * 0.45) / sr);
    const r2 = r * r;
    const norm = 1 - r;
    let y1 = 0, y2 = 0;
    return (x) => {
      const y = c * y1 - r2 * y2 + x * norm;
      y2 = y1; y1 = y;
      return y;
    };
  }

  /** Slowly wandering random value round 0, about `hz` changes a second. */
  function drift(sr, rand, hz) {
    const lp1 = svf(sr, 'low'), lp2 = svf(sr, 'low');
    // Filtered twice, so it wanders and does not jitter; and scaled back up,
    // because white noise through a low cutoff is very quiet.
    const k = Math.sqrt(sr / Math.max(0.1, hz)) * 0.9;
    return () => lp2(lp1(rand() * 2 - 1, hz), hz) * k;
  }

  function buffers(sr, seconds, channels) {
    const n = Math.max(1, Math.round(sr * seconds));
    const out = [];
    for (let c = 0; c < channels; c++) out.push(new Float32Array(n));
    return out;
  }

  /** Peak to `to`, with a short fade at the end so nothing clicks off. */
  function finish(chs, sr, to = 0.9, loop = false) {
    let peak = 1e-9;
    for (const ch of chs) for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > peak) peak = a; }
    const k = to / peak;
    // A loop goes round into its own start, so it is not faded.
    const fade = loop ? 0 : Math.min(Math.round(sr * 0.04), chs[0].length);
    for (const ch of chs) {
      const n = ch.length;
      for (let i = 0; i < n; i++) ch[i] *= k;
      for (let i = 0; i < fade; i++) ch[n - 1 - i] *= i / fade;
    }
    return chs;
  }

  /** A soft limit: a loud blast is a loud blast, not a clipped one. */
  const sat = (x, drive = 1.4) => {
    // tanh, near enough, at a fraction of the cost: it runs on every sample.
    const soft = (v) => (v > 3 ? 1 : v < -3 ? -1 : v * (27 + v * v) / (27 + 9 * v * v));
    return soft(x * drive) / soft(drive);
  };

  /** The rise of anything that does not start with a click. */
  const rise = (t, a) => (t >= a ? 1 : t / a);

  /**
   * A gun going off. `size` 0 is a destroyer's 5-inch, 1 the 46 cm of a Yamato.
   *
   * There is no note in it anywhere. A gun is not a drum: the falling tone that
   * made it sound like one is gone. What is left is what is really heard from a
   * ship's deck -- the shock front, so hard it overloads the ear, the blast of
   * hot gas behind it, a weight of air at the bottom of hearing, and then the
   * roll: the same blast coming back off the sea, the ships around and the
   * air itself, uneven, rumbling on and dying for seconds the way thunder does.
   */
  function gun(sr, rand, size = 0.5) {
    size = Math.min(1, Math.max(0, size));
    const dur = 2.6 + 4.2 * size;
    const chs = buffers(sr, dur, 2);
    const [L, R] = chs;
    const n = L.length;
    const frontHp = svf(sr, 'high');
    const gasLp = svf(sr, 'low'), gasLp2 = svf(sr, 'low');
    const subLp = svf(sr, 'low'), subLp2 = svf(sr, 'low');
    const rollL = svf(sr, 'low'), rollR = svf(sr, 'low');
    const rollL2 = svf(sr, 'low'), rollR2 = svf(sr, 'low');
    const echo = new Float32Array(n);
    const gasTau = 0.06 + 0.2 * size;
    const subTau = 0.16 + 0.42 * size;
    const rollTau = 0.9 + 1.9 * size;
    const nWave = 0.0018 + 0.0016 * size;
    // The roll is a run of uneven swells, not a smooth tail: each one the
    // blast coming back off something, arriving later and duller.
    const bumps = [];
    let tb = 0.06 + 0.05 * rand();
    while (tb < dur - 0.3) {
      bumps.push({ t: tb, w: 0.05 + 0.22 * rand() * (1 + tb * 0.4), a: (0.4 + 0.8 * rand()) * Math.exp(-tb / rollTau), side: rand() });
      tb += 0.04 + 0.28 * rand() * (1 + tb * 0.5);
    }
    let bi = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      // The front: a pressure step and its fall, and the ragged edge of it.
      let front = 0;
      if (t < nWave) front = 1 - 2 * t / nWave;
      if (t < 0.04) front += frontHp(rand() * 2 - 1, 700) * Math.exp(-t / 0.006) * 1.1;
      // The gas: broad noise whose top goes out of it as it expands.
      const fc = 120 + (3000 - 1800 * size) * Math.exp(-t / (0.04 + 0.06 * size));
      const gas = gasLp2(gasLp(rand() * 2 - 1, fc, 0.6), fc * 1.4, 0.6) * rise(t, 0.0012) * Math.exp(-t / gasTau) * 2.2;
      // The shove of air: noise with nothing left in it above sixty cycles.
      const sub = subLp2(subLp(rand() * 2 - 1, 55 + 20 * (1 - size), 0.7), 70, 0.7)
        * rise(t, 0.003) * Math.exp(-t / subTau) * 16;
      // The roll, swelling and falling, different in each ear.
      // (Each swell is summed out to three widths either side, where it has
      // died away to nothing: cut short, it was a click.)
      while (bi < bumps.length && bumps[bi].t + 3 * bumps[bi].w < t) bi++;
      let el = 0, er = 0;
      for (let k = bi; k < bumps.length && bumps[k].t - 3.2 < t; k++) {
        const b = bumps[k];
        if (Math.abs(t - b.t) > 3 * b.w) continue;
        const u = (t - b.t) / b.w;
        const g = Math.exp(-u * u) * b.a;
        el += g * (0.4 + 0.6 * b.side);
        er += g * (1 - 0.6 * b.side);
      }
      const rfc = 70 + 420 * Math.exp(-t / (0.5 + 0.6 * size));
      const base = rise(t, 0.05) * Math.exp(-t / (rollTau * 1.4)) * 0.35;
      const rl = rollL2(rollL(rand() * 2 - 1, rfc, 0.7), rfc * 1.2) * (el + base);
      const rr = rollR2(rollR(rand() * 2 - 1, rfc, 0.7), rfc * 1.2) * (er + base);
      echo[i] = gas + sub * 0.3;
      // Driven hard: at this pressure everything that hears it is overloaded.
      const dry = sat(front * 1.2 + gas + sub, 2.4);
      L[i] = dry + rl * 2.4;
      R[i] = dry + rr * 2.4;
    }
    // Answers off the ships about and the horizon: later, duller, quieter.
    // Each answer smeared over a few tens of milliseconds, the way a blast
    // comes back off a long, uneven surface rather than off one wall: as a
    // single clean repeat it was a slap-back, and it sounded like a cartoon.
    const taps = [];
    [0.18, 0.42, 0.75, 1.2, 1.9].forEach((d0, k) => {
      const d = d0 * (0.8 + 0.4 * rand()) * (0.7 + 0.6 * size);
      const side = rand();
      for (let j = 0; j < 7; j++) {
        taps.push({
          d: Math.round(sr * (d + (0.012 + 0.03 * k) * j * (0.6 + 0.8 * rand()))),
          a: 0.3 * Math.pow(0.6, k) * (0.4 + 0.6 * rand()) / 3.2, side,
        });
      }
    });
    // And duller than what went out: the echo source is the blast with its
    // top taken off.
    const dull = svf(sr, 'low'), dull2 = svf(sr, 'low');
    for (let i = 0; i < n; i++) echo[i] = dull2(dull(echo[i], 420), 420);
    for (let i = n - 1; i >= 0; i--) {
      let el = 0, er = 0;
      for (const tp of taps) {
        const j = i - tp.d;
        if (j < 0) continue;
        const v = echo[j] * tp.a;
        el += v * (0.5 + 0.5 * tp.side);
        er += v * (1 - 0.5 * tp.side);
      }
      L[i] += el; R[i] += er;
    }
    const sl = svf(sr, 'low'), sr2 = svf(sr, 'low');
    for (let i = 0; i < n; i++) {
      L[i] = sat(sl(L[i], 7000), 1.2);
      R[i] = sat(sr2(R[i], 7000), 1.2);
    }
    return finish(chs, sr);
  }

  /**
   * One round from an automatic gun: `kind` 'pom' for the 37 and 40 mm, 'rattle'
   * for the 20 mm. A sharp report and very little after it.
   */
  function autoGun(sr, rand, kind = 'pom') {
    const pom = kind === 'pom';
    const dur = pom ? 0.75 : 0.42;
    const chs = buffers(sr, dur, 1);
    const [M] = chs;
    const lp = svf(sr, 'low'), hp = svf(sr, 'high'), tail = svf(sr, 'low'), sub = svf(sr, 'low');
    const f0 = pom ? 110 : 190;
    for (let i = 0; i < M.length; i++) {
      const t = i / sr;
      const crack = t < 0.02 ? hp(rand() * 2 - 1, 1500) * Math.exp(-t / (pom ? 0.0025 : 0.0015)) : 0;
      const fc = (pom ? 600 : 1100) + (pom ? 5200 : 7000) * Math.exp(-t / (pom ? 0.025 : 0.014));
      const body = lp(rand() * 2 - 1, fc) * rise(t, 0.0008) * Math.exp(-t / (pom ? 0.045 : 0.022)) * 1.4;
      // The blow of it: air, not a note.
      const thump = sub(rand() * 2 - 1, f0, 0.7) * rise(t, 0.0008) * Math.exp(-t / (pom ? 0.05 : 0.025)) * 6;
      const roll = tail(rand() * 2 - 1, 380) * rise(t, 0.03) * Math.exp(-t / (pom ? 0.22 : 0.12)) * 0.6;
      // The breech going home: a small hard click after the report.
      const at = pom ? 0.19 : 0.07;
      const clack = t > at && t < at + 0.01 ? (rand() * 2 - 1) * Math.exp(-(t - at) / 0.002) * 0.12 : 0;
      M[i] = sat(crack * 0.8 + body + thump + roll + clack);
    }
    return finish(chs, sr);
  }

  /**
   * A round, or a bomb, into the sea. `size` 0 is a small shell, 1 a heavy one;
   * `bomb` is a bomb or a near miss going off in the water, which is a deep
   * blow under the surface and a much bigger column. The column is what is
   * heard longest: the rush of it going up and the rain of it coming down.
   */
  function splash(sr, rand, size = 0.5, bomb = false) {
    size = Math.min(1.4, Math.max(0, size));
    const up = bomb ? 2.4 : 0.55 + 1.3 * size;
    const fall = bomb ? 3.2 : 1.1 + 2.2 * size;
    const dur = up + fall + 0.4;
    const chs = buffers(sr, dur, 2);
    const [L, R] = chs;
    const slap = svf(sr, 'band'), rush = svf(sr, 'band');
    const rainL = svf(sr, 'band'), rainR = svf(sr, 'band');
    const washL = svf(sr, 'low'), washR = svf(sr, 'low');
    const deep = svf(sr, 'low');
    const dropL = resonator(sr, 2600 + 1400 * rand(), 0.012);
    const dropR = resonator(sr, 2200 + 1600 * rand(), 0.012);
    let ph = 0;
    for (let i = 0; i < L.length; i++) {
      const t = i / sr;
      // The slap of it on the surface.
      ph += TAU * ((bomb ? 32 : 60) + 50 * Math.exp(-t / 0.03)) / sr;
      let hitv = Math.sin(ph) * Math.exp(-t / (bomb ? 0.35 : 0.06 + 0.04 * size)) * (bomb ? 0.7 : 0.35);
      hitv += slap(rand() * 2 - 1, bomb ? 400 : 900, 0.9) * Math.exp(-t / (bomb ? 0.08 : 0.025)) * (bomb ? 0.5 : 1.1);
      // A bomb's own blast, deadened by the water it went off in.
      if (bomb) hitv += deep(rand() * 2 - 1, 90 + 500 * Math.exp(-t / 0.15)) * rise(t, 0.004) * Math.exp(-t / 0.5) * 2.2;
      // The column going up: a rushing hiss.
      const rEnv = rise(t, 0.03) * Math.exp(-t / (0.25 + 0.35 * size + (bomb ? 0.5 : 0)));
      const rushv = rush(rand() * 2 - 1, 700 + 1500 * Math.exp(-t / 0.35), 0.8) * rEnv * 0.7;
      // And it coming down: a broad wash, with the patter of the spray in it.
      const u = (t - up * 0.7) / fall;
      const fEnv = u > 0 && u < 1 ? Math.sin(Math.PI * Math.pow(u, 0.6)) ** 2 : 0;
      const dens = 0.004 + 0.02 * fEnv;
      const pl = rand() < dens ? (rand() * 2 - 1) * fEnv : 0;
      const pr = rand() < dens ? (rand() * 2 - 1) * fEnv : 0;
      const wl = washL(rand() * 2 - 1, 350 + 300 * fEnv) * fEnv * 0.9;
      const wr = washR(rand() * 2 - 1, 350 + 300 * fEnv) * fEnv * 0.9;
      const hl = rainL(rand() * 2 - 1, 2400, 0.6) * fEnv * 0.35;
      const hr = rainR(rand() * 2 - 1, 2400, 0.6) * fEnv * 0.35;
      L[i] = sat(hitv + rushv + wl + hl + dropL(pl) * 9);
      R[i] = sat(hitv + rushv + wr + hr + dropR(pr) * 9);
    }
    return finish(chs, sr);
  }

  /**
   * Metal debris: a scatter of short rings off broken plating and fittings,
   * thinning out. Shared by the explosions and the collisions.
   */
  function clatter(sr, rand, n, start, tau, level) {
    const bank = [];
    for (let k = 0; k < 4; k++) bank.push(resonator(sr, 380 + 2400 * rand(), 0.04 + 0.12 * rand()));
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / sr - start;
      if (t < 0) continue;
      const dens = 0.0025 * Math.exp(-t / tau);
      const x = rand() < dens ? (rand() * 2 - 1) : 0;
      let y = 0;
      for (const r of bank) y += r(x);
      out[i] = y * level * 14;
    }
    return out;
  }

  /**
   * A shell or a bomb going off in a ship, or anything else blowing up. `size`
   * 0 is a small HE burst, 1 a heavy one through her deck; `inside` deadens it,
   * because a round that got in goes off behind plating.
   */
  function explosion(sr, rand, size = 0.5, inside = false) {
    size = Math.min(1, Math.max(0, size));
    const dur = 1.6 + 3.2 * size;
    const chs = buffers(sr, dur, 2);
    const [L, R] = chs;
    const n = L.length;
    const lp = svf(sr, 'low'), hp = svf(sr, 'high'), sub = svf(sr, 'low');
    const rollL = svf(sr, 'low'), rollR = svf(sr, 'low');
    const swL = drift(sr, rand, 4), swR = drift(sr, rand, 4);
    const top = inside ? 1400 : 4200;
    const deb = clatter(sr, rand, n, 0.04, 0.35 + 0.5 * size, 0.18 + 0.12 * size);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const crack = !inside && t < 0.02 ? hp(rand() * 2 - 1, 1200) * Math.exp(-t / 0.003) : 0;
      const fc = 120 + top * Math.exp(-t / (0.06 + 0.08 * size));
      const body = lp(rand() * 2 - 1, fc, 0.8) * rise(t, 0.002) * Math.exp(-t / (0.12 + 0.3 * size)) * 1.7;
      ph += TAU * (28 + 20 * (1 - size) + 60 * Math.exp(-t / 0.03)) / sr;
      const thump = (Math.sin(ph) * 0.45 + sub(rand() * 2 - 1, 85, 0.9) * 7) * rise(t, 0.002) * Math.exp(-t / (0.15 + 0.35 * size));
      const rEnv = rise(t, 0.15) * Math.exp(-Math.max(0, t - 0.1) / (0.5 + 1.6 * size));
      const rl = rollL(rand() * 2 - 1, 90 + 220 * Math.exp(-t / 0.8)) * rEnv * (0.8 + 0.4 * swL());
      const rr = rollR(rand() * 2 - 1, 90 + 220 * Math.exp(-t / 0.8)) * rEnv * (0.8 + 0.4 * swR());
      const dry = crack * 0.7 + body + thump;
      L[i] = sat(dry + rl * 1.2 + deb[i]);
      R[i] = sat(dry + rr * 1.2 + deb[(i + 397) % n]);
    }
    return finish(chs, sr);
  }

  /**
   * A magazine. Not a bigger shell: one enormous blow, a second and a third as
   * more of her goes, and a roar that takes the best part of ten seconds to die.
   */
  function magazine(sr, rand) {
    const dur = 10;
    const chs = buffers(sr, dur, 2);
    const [L, R] = chs;
    const n = L.length;
    const hp = svf(sr, 'high');
    const rollL = svf(sr, 'low'), rollR = svf(sr, 'low');
    const swL = drift(sr, rand, 2), swR = drift(sr, rand, 2);
    const deb = clatter(sr, rand, n, 0.3, 2.5, 0.25);
    const blows = [0, 0.35 + rand() * 0.4, 1.2 + rand() * 1.2];
    const lps = blows.map(() => svf(sr, 'low'));
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let b = 0;
      for (let k = 0; k < blows.length; k++) {
        const u = t - blows[k];
        if (u < 0) continue;
        const g = k === 0 ? 1.8 : 0.9;
        b += lps[k](rand() * 2 - 1, 100 + 2500 * Math.exp(-u / 0.12)) * rise(u, 0.003) * Math.exp(-u / 0.5) * g;
      }
      const crack = t < 0.03 ? hp(rand() * 2 - 1, 900) * Math.exp(-t / 0.005) : 0;
      ph += TAU * (19 + 40 * Math.exp(-t / 0.05)) / sr;
      const thump = Math.sin(ph) * rise(t, 0.003) * Math.exp(-t / 0.9) * 1.2;
      const rEnv = rise(t, 0.4) * Math.exp(-Math.max(0, t - 0.3) / 3.2);
      const rl = rollL(rand() * 2 - 1, 70 + 200 * Math.exp(-t / 2)) * rEnv * (0.75 + 0.5 * swL());
      const rr = rollR(rand() * 2 - 1, 70 + 200 * Math.exp(-t / 2)) * rEnv * (0.75 + 0.5 * swR());
      L[i] = sat(crack * 0.7 + b + thump + rl * 1.6 + deb[i], 1.8);
      R[i] = sat(crack * 0.7 + b + thump + rr * 1.6 + deb[(i + 811) % n], 1.8);
    }
    return finish(chs, sr);
  }

  /**
   * Armour that kept a round out: the plate rings. `kind` 'clang' for a plain
   * bounce off the belt, 'shatter' for the shell breaking up on it, 'ricochet'
   * for one that glanced away -- the ring and then the shell tumbling off.
   */
  function armour(sr, rand, kind = 'clang') {
    const dur = kind === 'ricochet' ? 1.6 : 1.3;
    const chs = buffers(sr, dur, 1);
    const [M] = chs;
    const f0 = 150 + 140 * rand();
    // A thick plate's modes: nothing like a bell's, not a chord, close together.
    const ratios = [1, 1.59, 2.14, 2.3, 2.65, 3.16, 3.5, 4.15, 5.2];
    const modes = ratios.map((r, k) => ({
      f: f0 * r * (0.98 + 0.04 * rand()),
      a: 1 / Math.pow(k + 1, 0.6) * (0.6 + 0.4 * rand()),
      tau: 0.75 / (1 + 0.55 * k),
      ph: rand() * TAU,
    }));
    const hp = svf(sr, 'high'), bp = svf(sr, 'band'), whirr = svf(sr, 'band');
    let ph = 0;
    for (let i = 0; i < M.length; i++) {
      const t = i / sr;
      let ring = 0;
      for (const m of modes) ring += Math.sin(TAU * m.f * t + m.ph) * m.a * Math.exp(-t / m.tau);
      ring *= rise(t, 0.0005) * 0.35;
      const hitv = t < 0.02 ? hp(rand() * 2 - 1, 1800) * Math.exp(-t / 0.0018) : 0;
      ph += TAU * (85 + 60 * Math.exp(-t / 0.01)) / sr;
      const thud = Math.sin(ph) * Math.exp(-t / 0.045) * 0.8;
      let extra = 0;
      if (kind === 'shatter') extra = bp(rand() * 2 - 1, 2200, 0.9) * Math.exp(-t / 0.07) * 1.2;
      if (kind === 'ricochet' && t > 0.03) {
        const u = t - 0.03;
        // The shell going end over end away from her.
        const tumble = 0.55 + 0.45 * Math.sin(TAU * 24 * u);
        extra = whirr(rand() * 2 - 1, 600 + 1400 * Math.exp(-u / 0.4), 3) * tumble * Math.exp(-u / 0.45) * 1.4;
      }
      M[i] = sat(hitv + thud + ring + extra);
    }
    return finish(chs, sr);
  }

  /**
   * Steel under more load than it was built for: a stick-slip creak, the plating
   * ringing at every slip, and the deeper groan of the whole frame working.
   * `deep` makes it the long, low moan of a hull bending rather than a seam.
   */
  function creak(sr, rand, deep = false) {
    // Steel loaded past what it was built for does not hum and it does not
    // squeak like a door. It holds, and holds, and lets go a little -- a
    // slip, at no regular rate, in clusters as the load comes on -- and every
    // slip sets the plates and frames ringing at their own pitches, which are
    // not a chord: a plate's are anything but whole multiples of each other.
    // Under it all the hull groans, a low, uneven strain with no pitch to it.
    // And all of it is heard through her and the water round her, so the top
    // is gone and it rings on in the hull.
    const dur = deep ? 3.5 + 3 * rand() : 1.8 + 2 * rand();
    const chs = buffers(sr, dur, 1);
    const [M] = chs;
    const base = deep ? 42 + 30 * rand() : 85 + 90 * rand();
    const ratios = [1, 1.47, 2.09, 2.83, 3.61, 4.95, 6.27, 8.3, 10.9];
    const modes = ratios.map((r, k) => resonator(sr, base * r * (0.93 + 0.14 * rand()),
      (deep ? 0.32 : 0.16) / (1 + k * 0.18)));
    const gains = ratios.map((_, k) => (0.5 + rand()) / (1 + k * 0.35));
    // How the load comes on and goes off: one or two slow swells.
    const peaks = [0.25 + 0.4 * rand(), 0.5 + 0.45 * rand()];
    const bell = (u, at, w) => { const z = (u - at) / w; return Math.exp(-z * z); };
    const load = (u) => bell(u, peaks[0], 0.22) + 0.7 * bell(u, peaks[1], 0.18);
    const groanBp = svf(sr, 'band'), groanBp2 = svf(sr, 'band'), groanLp = svf(sr, 'low');
    const gf0 = base * (0.8 + 0.5 * rand());
    const glide = (rand() - 0.5) * 0.5;
    const wander = drift(sr, rand, 0.7);
    const out = svf(sr, 'low'), out2 = svf(sr, 'low');
    // The inside of a steel box: a few short reflections that ring with it.
    const rooms = [0.019, 0.031, 0.047].map((d) => ({ d: Math.round(sr * d * (0.8 + 0.4 * rand())), buf: null }));
    for (const r of rooms) r.buf = new Float32Array(r.d);
    let slipHold = 0;
    for (let i = 0; i < M.length; i++) {
      const t = i / sr;
      const u = t / dur;
      const ld = load(u) * Math.min(1, t / 0.08) * Math.min(1, (dur - t) / 0.3);
      // A slip: more often and harder as the load comes on, and once one goes
      // the next follows close behind it.
      let x = 0;
      const rate = (deep ? 6 : 14) * ld * ld + 0.3;
      slipHold -= 1 / sr;
      if (rand() < rate / sr * (slipHold > 0 ? 6 : 1)) {
        x = (0.3 + 0.7 * rand()) * (0.3 + ld) * (rand() < 0.08 ? 2.5 : 1);
        slipHold = 0.03 + 0.05 * rand();
      }
      let y = 0;
      for (let k = 0; k < modes.length; k++) y += modes[k](x) * gains[k];
      y *= 22;
      // The groan: band-limited strain, wandering in pitch, never a tone.
      const gf = gf0 * (1 + glide * u) * (1 + 0.12 * wander());
      const g = groanBp2(groanBp(rand() * 2 - 1, gf, 5), gf * 1.02, 5);
      const groan = groanLp(g, gf * 3) * ld * (deep ? 1.6 : 0.8);
      let v = y + groan;
      for (const r of rooms) {
        const j = i % r.d;
        const back = r.buf[j];
        r.buf[j] = v * 0.5 + back * 0.32;
        v += back * 0.3;
      }
      M[i] = sat(out2(out(v, deep ? 900 : 1500), deep ? 1100 : 1800), 1.3);
    }
    return finish(chs, sr);
  }

  /**
   * A bulkhead going, inside a hull that is filling: a deadened blow, the ring of
   * it through the frames and a gout of air bubbling out after it.
   */
  function bang(sr, rand) {
    const dur = 2.6;
    const chs = buffers(sr, dur, 1);
    const [M] = chs;
    const lp = svf(sr, 'low'), out = svf(sr, 'low');
    const modes = [1, 1.9, 3.3].map((r) => resonator(sr, (70 + 60 * rand()) * r, 0.5));
    let ph = 0;
    let bub = null;
    for (let i = 0; i < M.length; i++) {
      const t = i / sr;
      ph += TAU * (40 + 30 * Math.exp(-t / 0.04)) / sr;
      const thump = Math.sin(ph) * rise(t, 0.003) * Math.exp(-t / 0.18);
      const body = lp(rand() * 2 - 1, 120 + 600 * Math.exp(-t / 0.06)) * Math.exp(-t / 0.12) * 1.3;
      const x = t < 0.004 ? rand() * 2 - 1 : 0;
      let ring = 0;
      for (const m of modes) ring += m(x);
      // Bubbles: short rising whistles of air coming up through the water.
      let b = 0;
      if (t > 0.25 && t < 2.2 && !bub && rand() < 0.0009 * Math.exp(-(t - 0.25) / 0.8)) {
        bub = { t0: t, f: 180 + 380 * rand(), tau: 0.03 + 0.05 * rand(), a: 0.25 + 0.3 * rand(), ph: 0 };
      }
      if (bub) {
        const u = t - bub.t0;
        bub.ph += TAU * bub.f * (1 + 2.5 * u) / sr;
        b = Math.sin(bub.ph) * bub.a * Math.exp(-u / bub.tau);
        if (u > bub.tau * 6) bub = null;
      }
      M[i] = sat(out(thump + body + ring * 25 + b, 1500));
    }
    return finish(chs, sr);
  }

  /**
   * Air coming out of her as the sea comes in: a hard hiss through whatever
   * vent or split it can find, fluttering, and a boil of bubbles.
   */
  function vent(sr, rand) {
    const dur = 2.6 + 1.6 * rand();
    const chs = buffers(sr, dur, 2);
    const [L, R] = chs;
    const bpL = svf(sr, 'band'), bpR = svf(sr, 'band'), boil = svf(sr, 'low');
    const flutter = 7 + 7 * rand();
    const sway = drift(sr, rand, 1.2);
    const bubs = [];
    for (let i = 0; i < L.length; i++) {
      const t = i / sr;
      const env = Math.min(1, t / 0.25) * Math.min(1, (dur - t) / 0.8) * (0.8 + 0.3 * sway());
      const fl = 0.75 + 0.25 * Math.sin(TAU * flutter * t);
      const hl = bpL(rand() * 2 - 1, 3200, 0.7) * env * fl * 0.5;
      const hr = bpR(rand() * 2 - 1, 3600, 0.7) * env * fl * 0.5;
      if (bubs.length < 6 && rand() < 0.0012 * env) {
        bubs.push({ t0: t, f: 220 + 520 * rand(), tau: 0.025 + 0.04 * rand(), a: 0.3 + 0.4 * rand(), ph: 0, side: rand() });
      }
      let bl = 0, br = 0;
      for (let k = bubs.length - 1; k >= 0; k--) {
        const q = bubs[k];
        const u = t - q.t0;
        q.ph += TAU * q.f * (1 + 2.2 * u) / sr;
        const v = Math.sin(q.ph) * q.a * Math.exp(-u / q.tau);
        bl += v * (1 - q.side); br += v * q.side;
        if (u > q.tau * 6) bubs.splice(k, 1);
      }
      const low = boil(rand() * 2 - 1, 260) * env * 0.8;
      L[i] = sat(hl + bl + low);
      R[i] = sat(hr + br + low);
    }
    return finish(chs, sr, 0.8);
  }

  /**
   * Two hulls meeting: a crash, then plating dragging along plating -- the same
   * stick-slip as a creak, driven far faster and harder -- and the debris.
   */
  function crash(sr, rand) {
    const dur = 2.8;
    const chs = buffers(sr, dur, 2);
    const [L, R] = chs;
    const n = L.length;
    const lp = svf(sr, 'low');
    const modes = [1, 2.3, 3.9, 6.1, 8.4].map((r) => resonator(sr, (140 + 120 * rand()) * r, 0.07));
    const deb = clatter(sr, rand, n, 0.05, 0.8, 0.22);
    const wander = drift(sr, rand, 3);
    const scr = svf(sr, 'band');
    let ph = 0, sp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      ph += TAU * (36 + 40 * Math.exp(-t / 0.04)) / sr;
      const thump = Math.sin(ph) * rise(t, 0.003) * Math.exp(-t / 0.3) * 1.1;
      const body = lp(rand() * 2 - 1, 140 + 1800 * Math.exp(-t / 0.08)) * Math.exp(-t / 0.18) * 1.4;
      const env = rise(t, 0.08) * Math.exp(-t / 0.9);
      sp += Math.max(5, 55 * (1 + 0.6 * wander())) / sr;
      let x = 0;
      if (sp >= 1) { sp -= 1; x = (0.5 + 0.5 * rand()) * env; }
      let y = 0;
      for (const m of modes) y += m(x);
      const grind = y * 22 + scr(rand() * 2 - 1, 1500, 2) * env * 0.4;
      L[i] = sat(thump + body + grind + deb[i]);
      R[i] = sat(thump + body + grind * 0.85 + deb[(i + 523) % n]);
    }
    return finish(chs, sr);
  }

  /**
   * A torpedo leaving her tube: a blow of compressed air, the fish going into
   * the sea a moment later.
   */
  function launch(sr, rand) {
    const dur = 1.4;
    const chs = buffers(sr, dur, 1);
    const [M] = chs;
    const air = svf(sr, 'band'), sp = svf(sr, 'band'), hp = svf(sr, 'high');
    let ph = 0;
    for (let i = 0; i < M.length; i++) {
      const t = i / sr;
      const puff = air(rand() * 2 - 1, 450, 0.8) * rise(t, 0.004) * Math.exp(-t / 0.09) * 1.8;
      const hiss = hp(rand() * 2 - 1, 2500) * rise(t, 0.01) * Math.exp(-t / 0.14) * 0.3;
      ph += TAU * (70 + 40 * Math.exp(-t / 0.02)) / sr;
      const thump = Math.sin(ph) * Math.exp(-t / 0.06) * 0.8;
      const u = t - 0.32;
      const entry = u > 0 ? sp(rand() * 2 - 1, 1100, 0.7) * rise(u, 0.02) * Math.exp(-u / 0.25) * 1.1 : 0;
      M[i] = sat(puff + hiss + thump + entry);
    }
    return finish(chs, sr);
  }

  /**
   * A torpedo against her side: a huge blow under the water, the hull shuddering
   * with it, and the column it threw up coming down all over her.
   */
  function torpHit(sr, rand) {
    const dur = 5.6;
    const chs = buffers(sr, dur, 2);
    const [L, R] = chs;
    const n = L.length;
    const lp = svf(sr, 'low');
    const modes = [1, 1.7, 2.9, 4.4].map((r) => resonator(sr, (95 + 70 * rand()) * r, 0.7));
    const rainL = svf(sr, 'low'), rainR = svf(sr, 'low');
    const hissL = svf(sr, 'band'), hissR = svf(sr, 'band');
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      ph += TAU * (22 + 45 * Math.exp(-t / 0.05)) / sr;
      const thump = Math.sin(ph) * rise(t, 0.004) * Math.exp(-t / 0.55) * 1.3;
      const body = lp(rand() * 2 - 1, 80 + 700 * Math.exp(-t / 0.12)) * rise(t, 0.003) * Math.exp(-t / 0.35) * 2;
      const x = t < 0.006 ? rand() * 2 - 1 : 0;
      let ring = 0;
      for (const m of modes) ring += m(x);
      const u = (t - 1.6) / 3.4;
      const fEnv = u > 0 && u < 1 ? Math.sin(Math.PI * Math.pow(u, 0.55)) ** 2 : 0;
      const wl = rainL(rand() * 2 - 1, 450) * fEnv * 1.0 + hissL(rand() * 2 - 1, 2200, 0.6) * fEnv * 0.3;
      const wr = rainR(rand() * 2 - 1, 450) * fEnv * 1.0 + hissR(rand() * 2 - 1, 2200, 0.6) * fEnv * 0.3;
      L[i] = sat(thump + body + ring * 30 + wl, 1.6);
      R[i] = sat(thump + body + ring * 30 + wr, 1.6);
    }
    return finish(chs, sr);
  }

  /**
   * The general alarm: a gong struck three times, the way it goes through a
   * ship's spaces -- not a beep.
   */
  function alarm(sr, rand) {
    const dur = 1.9;
    const chs = buffers(sr, dur, 1);
    const [M] = chs;
    const f0 = 420 + 30 * rand();
    const ratios = [1, 2.02, 2.98, 4.1, 5.4];
    for (let i = 0; i < M.length; i++) {
      const t = i / sr;
      let y = 0;
      for (let s = 0; s < 3; s++) {
        const u = t - s * 0.42;
        if (u < 0) continue;
        for (let k = 0; k < ratios.length; k++) {
          y += Math.sin(TAU * f0 * ratios[k] * u) * Math.exp(-u / (0.55 / (1 + k * 0.6))) / (k + 1);
        }
      }
      M[i] = y * rise(t, 0.001);
    }
    return finish(chs, sr, 0.6);
  }

  // --------------------------------------------------------------- loops ----

  /** Round the end of a loop into its start so it repeats without a seam. */
  function seam(chs, sr, len, over) {
    const n = Math.round(len * sr);
    const x = Math.round(over * sr);
    return chs.map((ch) => {
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = ch[i];
      for (let i = 0; i < x; i++) {
        const w = i / x;
        out[i] = ch[i] * Math.sqrt(w) + ch[n + i] * Math.sqrt(1 - w);
      }
      return out;
    });
  }

  /**
   * The open sea: the slop and wash of the swell, with a little wind over it.
   * Ten seconds, repeating; the slow surges are whole cycles of the loop.
   */
  function sea(sr, rand) {
    const len = 10, over = 0.8;
    const chs = buffers(sr, len + over, 2);
    const [L, R] = chs;
    const wl = svf(sr, 'low'), wr = svf(sr, 'low');
    const fl = svf(sr, 'band'), fr = svf(sr, 'band');
    const wind = svf(sr, 'band');
    const ph = [rand(), rand(), rand(), rand()].map((p) => p * TAU);
    for (let i = 0; i < L.length; i++) {
      const t = i / sr;
      const s1 = 0.5 + 0.5 * Math.sin(TAU * t / len * 2 + ph[0]);
      const s2 = 0.5 + 0.5 * Math.sin(TAU * t / len * 3 + ph[1]);
      const s3 = 0.5 + 0.5 * Math.sin(TAU * t / len * 5 + ph[2]);
      const surgeL = 0.35 + 0.65 * s1 * s3;
      const surgeR = 0.35 + 0.65 * s2 * s3;
      const gust = 0.6 + 0.4 * Math.sin(TAU * t / len + ph[3]);
      const w = wind(rand() * 2 - 1, 500 + 300 * gust, 0.6) * gust * 0.18;
      L[i] = wl(rand() * 2 - 1, 380 + 240 * surgeL) * surgeL + fl(rand() * 2 - 1, 2600, 0.5) * surgeL * surgeL * 0.22 + w;
      R[i] = wr(rand() * 2 - 1, 380 + 240 * surgeR) * surgeR + fr(rand() * 2 - 1, 2600, 0.5) * surgeR * surgeR * 0.22 + w;
    }
    return finish(seam(chs, sr, len, over), sr, 0.7, true);
  }

  /** Wind on its own, for high up: gusting, hollow, no sea in it. */
  function wind(sr, rand) {
    const len = 12, over = 1;
    const chs = buffers(sr, len + over, 2);
    const [L, R] = chs;
    const bl = svf(sr, 'band'), br = svf(sr, 'band');
    const ph = [rand(), rand(), rand()].map((p) => p * TAU);
    for (let i = 0; i < L.length; i++) {
      const t = i / sr;
      const g1 = 0.5 + 0.5 * Math.sin(TAU * t / len * 2 + ph[0]);
      const g2 = 0.5 + 0.5 * Math.sin(TAU * t / len * 3 + ph[1]);
      const g = 0.3 + 0.7 * g1 * (0.6 + 0.4 * Math.sin(TAU * t / len * 7 + ph[2]));
      L[i] = bl(rand() * 2 - 1, 280 + 520 * g, 1.6) * g;
      R[i] = br(rand() * 2 - 1, 300 + 520 * (0.3 + 0.7 * g2), 1.6) * (0.3 + 0.7 * g2);
    }
    return finish(seam(chs, sr, len, over), sr, 0.7, true);
  }

  /**
   * A ship's way through the water: her bow wave breaking and the wake
   * churning under her counter, rising and falling as she pitches.
   */
  function wash(sr, rand) {
    const len = 6, over = 0.6;
    const chs = buffers(sr, len + over, 2);
    const [L, R] = chs;
    const lowL = svf(sr, 'low'), lowR = svf(sr, 'low');
    const midL = svf(sr, 'band'), midR = svf(sr, 'band');
    const ph = [rand(), rand(), rand()].map((p) => p * TAU);
    for (let i = 0; i < L.length; i++) {
      const t = i / sr;
      const pitch = 0.5 + 0.5 * Math.sin(TAU * t / len * 2 + ph[0]);
      const chop = 0.5 + 0.5 * Math.sin(TAU * t / len * 7 + ph[1]);
      const bow = 0.45 + 0.55 * pitch * (0.7 + 0.3 * chop);
      const wake = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(TAU * t / len * 3 + ph[2]));
      L[i] = lowL(rand() * 2 - 1, 500) * wake * 0.8 + midL(rand() * 2 - 1, 1100 + 500 * bow, 0.5) * bow * 0.7;
      R[i] = lowR(rand() * 2 - 1, 500) * wake * 0.8 + midR(rand() * 2 - 1, 1000 + 500 * bow, 0.5) * bow * 0.7;
    }
    return finish(seam(chs, sr, len, over), sr, 0.8, true);
  }

  /**
   * Her machinery: the shafts and the turbines -- a low beat of harmonics, the
   * whine of the turbines faint over it and the roar of the boiler-room fans.
   * Two seconds, every partial a whole number of cycles in it, so it loops
   * clean; audio.js runs it faster as she works up.
   */
  function machinery(sr, rand, diesel = false) {
    const len = 2;
    const chs = buffers(sr, len, 1);
    const [M] = chs;
    const base = diesel ? 13 : 24;        // whole cycles in two seconds: 26 Hz / 12 Hz
    const parts = [];
    for (let k = 1; k <= 14; k++) {
      parts.push({ f: base * k / len, a: (diesel ? 1 / Math.pow(k, 0.7) : 1 / k) * (0.6 + 0.4 * rand()), ph: rand() * TAU });
    }
    // The turbine whine.
    if (!diesel) parts.push({ f: 2300 / len, a: 0.02, ph: 0 }, { f: 3460 / len, a: 0.012, ph: 0 });
    // And noise, shaped to repeat: built over the loop's own length and joined.
    const fan = buffers(sr, len + 0.3, 1)[0];
    const lp = svf(sr, 'low');
    for (let i = 0; i < fan.length; i++) fan[i] = lp(rand() * 2 - 1, 420);
    const [fanLoop] = seam([fan], sr, len, 0.3);
    for (let i = 0; i < M.length; i++) {
      const t = i / sr;
      let y = 0;
      for (const p of parts) y += Math.sin(TAU * p.f * t + p.ph) * p.a;
      M[i] = y * 0.6 + fanLoop[i] * 1.6;
    }
    return finish(chs, sr, 0.7, true);
  }

  /** Every one-shot the game asks for, by name, with how many takes of it. */
  /**
   * Air torn by a shell going through it: the raw stuff of the whistle a round
   * makes overhead, a loop of noise with a little flutter in it. The pitch,
   * the shriek and the falling note as it goes by are put on it as it is
   * played, by the filters audio.js runs it through (see shells there).
   */
  function shellAir(sr, rand) {
    const dur = 2;
    const chs = buffers(sr, dur, 1);
    const [M] = chs;
    const lp = svf(sr, 'low');
    const n = M.length;
    // Flutter on whole cycles of the loop, so it goes round without a seam.
    const f1 = 7 / dur, f2 = 13 / dur, p1 = rand() * TAU, p2 = rand() * TAU;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const fl = 0.8 + 0.12 * Math.sin(TAU * f1 * t + p1) + 0.08 * Math.sin(TAU * f2 * t + p2);
      M[i] = lp(rand() * 2 - 1, 9000) * fl;
    }
    return finish(chs, sr, 0.9, true);
  }

  const RECIPES = {
    gunHeavy: { takes: 2, make: (sr, r) => gun(sr, r, 0.9) },
    gunMedium: { takes: 2, make: (sr, r) => gun(sr, r, 0.45) },
    gunLight: { takes: 3, make: (sr, r) => gun(sr, r, 0.08) },
    pom: { takes: 4, make: (sr, r) => autoGun(sr, r, 'pom') },
    rattle: { takes: 4, make: (sr, r) => autoGun(sr, r, 'rattle') },
    splashSmall: { takes: 3, make: (sr, r) => splash(sr, r, 0.15) },
    splashLarge: { takes: 2, make: (sr, r) => splash(sr, r, 0.85) },
    splashBomb: { takes: 2, make: (sr, r) => splash(sr, r, 1.2, true) },
    boomSmall: { takes: 3, make: (sr, r) => explosion(sr, r, 0.2) },
    boomLarge: { takes: 2, make: (sr, r) => explosion(sr, r, 0.8) },
    boomInside: { takes: 2, make: (sr, r) => explosion(sr, r, 0.6, true) },
    magazine: { takes: 1, make: (sr, r) => magazine(sr, r) },
    clang: { takes: 3, make: (sr, r) => armour(sr, r, 'clang') },
    shatter: { takes: 2, make: (sr, r) => armour(sr, r, 'shatter') },
    ricochet: { takes: 3, make: (sr, r) => armour(sr, r, 'ricochet') },
    creak: { takes: 5, make: (sr, r) => creak(sr, r, false) },
    groan: { takes: 3, make: (sr, r) => creak(sr, r, true) },
    bang: { takes: 3, make: (sr, r) => bang(sr, r) },
    vent: { takes: 2, make: (sr, r) => vent(sr, r) },
    crash: { takes: 2, make: (sr, r) => crash(sr, r) },
    launch: { takes: 2, make: (sr, r) => launch(sr, r) },
    torpHit: { takes: 2, make: (sr, r) => torpHit(sr, r) },
    alarm: { takes: 1, make: (sr, r) => alarm(sr, r) },
    sea: { takes: 1, make: (sr, r) => sea(sr, r) },
    wind: { takes: 1, make: (sr, r) => wind(sr, r) },
    wash: { takes: 2, make: (sr, r) => wash(sr, r) },
    turbines: { takes: 2, make: (sr, r) => machinery(sr, r, false) },
    diesels: { takes: 1, make: (sr, r) => machinery(sr, r, true) },
    shellAir: { takes: 1, make: (sr, r) => shellAir(sr, r) },
  };

  return { rng, gun, autoGun, splash, explosion, magazine, armour, creak, bang, vent, crash, launch, torpHit, alarm, sea, wind, wash, machinery, shellAir, RECIPES };
}

export const { rng, gun, autoGun, splash, explosion, magazine, armour, creak, bang, vent, crash, launch, torpHit, alarm, sea, wind, wash, machinery, shellAir, RECIPES } = sfxKit();
