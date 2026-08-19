// WebSocket link to the battle service, with a message bus and auto-reconnect
// while the player is sitting on the title screen.

// The public battle service. Native shells (Capacitor/Cordova) serve the bundle
// from a local scheme, so there is no server on `location.host` to talk to and
// they have to be sent here instead.
export const PUBLIC_SERVER = 'steelcurrents.com';

/** Where the battle service lives for however this build is being served. */
export function serviceUrl() {
  if (globalThis.STEEL_CURRENTS_SERVER) return globalThis.STEEL_CURRENTS_SERVER;
  // Served over the web (steelcurrents.com, a staging host, or localhost during
  // development): the service is the same origin that handed us the page.
  if (location.protocol === 'https:') return `wss://${location.host}/ws`;
  if (location.protocol === 'http:') return `ws://${location.host}/ws`;
  return `wss://${PUBLIC_SERVER}/ws`;
}

export class Net extends EventTarget {
  constructor(url) {
    super();
    this.url = url || serviceUrl();
    this.ws = null;
    this.connected = false;
    this.ping = 0;
    this.retry = 0;
    this.pingTimer = null;
  }

  connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    try { this.ws = new WebSocket(this.url); } catch { this.scheduleRetry(); return; }

    this.ws.onopen = () => {
      this.connected = true;
      this.retry = 0;
      this.emit('open');
      this.pingTimer = setInterval(() => this.send({ t: 'ping', c: Date.now() }), 3000);
    };
    this.ws.onclose = () => {
      this.connected = false;
      clearInterval(this.pingTimer);
      this.emit('close');
      this.scheduleRetry();
    };
    this.ws.onerror = () => { /* close follows */ };
    this.ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.t === 'pong') { this.ping = Date.now() - msg.c; return; }
      this.emit(msg.t, msg);
      this.emit('*', msg);
    };
  }

  scheduleRetry() {
    this.retry = Math.min(this.retry + 1, 6);
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), 500 * 2 ** this.retry);
  }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

  on(type, fn) {
    const h = (e) => fn(e.detail);
    this.addEventListener(type, h);
    return () => this.removeEventListener(type, h);
  }

  send(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }
}
