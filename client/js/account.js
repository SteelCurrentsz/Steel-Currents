// Who is at the wheel, and how the game remembers him.
//
// The game asks once, on the first run, and never again: an account is written
// to this device's storage the moment one is made, and every later start reads
// it back and goes straight to the menu.
//
// ------------------------------------------------------------ the caveat --
//
// Two of the three ways in are federated -- Sign in with Apple and Google Play
// Games -- and neither can be finished inside a page like this one. Both need
// three things this repository does not have and cannot invent:
//
//   * a developer account with Apple or Google and a client id issued against
//     it, tied to a registered bundle or an authorised web domain;
//   * a server that holds the client secret and verifies the identity token
//     the provider returns, because a token verified by the client that asked
//     for it proves nothing at all;
//   * for Google Play Games specifically, an installed Android application --
//     Play Games sign-in does not exist on the open web.
//
// So the providers here are written as a seam rather than as a pretence. Each
// one is a `sign()` that returns an account, and the two federated ones say
// exactly where the provider's own call goes. Until that call is wired to real
// credentials they record a local account of the right shape and mark it
// `local: true`, and the account screen says so to the player's face rather
// than showing him a name he never signed in with.
//
// That distinction matters for the reinstall promise. A guest, or a federated
// account that has not been wired up yet, lives in this device's storage: clear
// the site's data and it is gone. A real Apple or Google account survives a
// reinstall because the provider gives the same subject identifier back to the
// same person on the same device -- which is the whole reason to offer them.

/** Where the account is kept. Versioned, so a change of shape can migrate. */
const KEY = 'sc.account.v1';

/**
 * The providers.
 *
 * `id` is what goes in the record, `label` what the button says, and `sign()`
 * is the way in. `federated` marks the two that need a developer account and a
 * server before they are real.
 */
export const PROVIDERS = {
  apple: {
    id: 'apple',
    label: 'Apple ID',
    federated: true,
    /**
     * Sign in with Apple.
     *
     * The real call is `AppleID.auth.signIn()`, after
     * `AppleID.auth.init({ clientId, scope, redirectURI, usePopup: true })`
     * with a Services ID registered to an Apple developer account. It returns
     * an `id_token`, which is a JWT that has to go to a server, be verified
     * against Apple's public keys, and have its `sub` claim taken as the
     * account id. `sub` is stable for the same person and the same Services
     * ID, which is what carries an account across a reinstall.
     */
    async sign() {
      const AppleID = globalThis.AppleID;
      if (AppleID?.auth?.signIn) {
        const res = await AppleID.auth.signIn();
        const sub = res?.authorization?.id_token
          ? claim(res.authorization.id_token, 'sub') : null;
        if (sub) {
          return {
            provider: 'apple', id: `apple:${sub}`, local: false,
            name: res.user?.name?.firstName || 'Captain',
          };
        }
      }
      return null;
    },
  },
  google: {
    id: 'google',
    label: 'Google Play',
    federated: true,
    /**
     * Google Play Games.
     *
     * On Android this is the Play Games Services sign-in, which hands back a
     * player id that is stable for the same Google account -- so the game is
     * found again after a reinstall without the player doing anything. On the
     * web there is no Play Games sign-in at all; the nearest thing is Google
     * Identity Services (`google.accounts.id`), whose credential is a JWT with
     * the same `sub`-claim shape as Apple's and the same need for a server to
     * verify it.
     */
    async sign() {
      const g = globalThis.google;
      if (g?.accounts?.id?.prompt) {
        const cred = await new Promise((done) => {
          g.accounts.id.initialize({ callback: (r) => done(r?.credential || null) });
          g.accounts.id.prompt();
          setTimeout(() => done(null), 30000);
        });
        const sub = cred ? claim(cred, 'sub') : null;
        if (sub) return { provider: 'google', id: `google:${sub}`, local: false, name: 'Captain' };
      }
      return null;
    },
  },
  guest: {
    id: 'guest',
    label: 'Guest',
    federated: false,
    /**
     * A guest. No provider, no server, no promise beyond this device: an id
     * drawn here and written to storage. It is a real account as far as the
     * game is concerned -- it holds the settings and the fleet -- it simply
     * cannot be carried anywhere else.
     */
    async sign() {
      return { provider: 'guest', id: `guest:${rid()}`, local: true, name: 'Captain' };
    },
  },
};

/** One claim out of a JWT payload, without verifying it -- that is the server's job. */
function claim(token, name) {
  try {
    const part = String(token).split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json)[name] ?? null;
  } catch { return null; }
}

/** A random identifier, from the platform's own generator where there is one. */
function rid() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    return [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Storage, if this browser has any that works. A private window may not. */
function store() {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    s.setItem('sc.probe', '1');
    s.removeItem('sc.probe');
    return s;
  } catch { return null; }
}

/**
 * The account on this device, or null if nobody has ever signed in here.
 *
 * This is what makes the game ask once and only once: it is read at start-up,
 * and if it answers, the login screen is never put up.
 */
export function current() {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(KEY);
    if (!raw) return null;
    const acc = JSON.parse(raw);
    return acc && acc.id && acc.provider ? acc : null;
  } catch { return null; }
}

/** Write an account to this device, and hand it back. */
export function remember(acc) {
  const s = store();
  const full = { ...acc, since: acc.since || Date.now() };
  if (s) {
    try { s.setItem(KEY, JSON.stringify(full)); } catch { /* full, or refused */ }
  }
  return full;
}

/**
 * Sign in with a provider and remember the result.
 *
 * A federated provider that is not wired up yet returns nothing from its own
 * call; rather than leaving the player on a dead button, an account of the
 * right shape is recorded for it and marked `local`, so the game runs and the
 * account screen can tell him the truth about what he is signed in with.
 */
export async function signIn(which) {
  const p = PROVIDERS[which];
  if (!p) throw new Error(`no such provider: ${which}`);
  let acc = null;
  try { acc = await p.sign(); } catch { acc = null; }
  if (!acc) {
    acc = { provider: p.id, id: `${p.id}:${rid()}`, local: true, name: 'Captain' };
  }
  return remember(acc);
}

/** Forget the account on this device. The login screen comes back next start. */
export function signOut() {
  const s = store();
  if (s) { try { s.removeItem(KEY); } catch { /* nothing to do */ } }
}

/** Whether this device can remember anything at all. */
export function persists() { return !!store(); }
