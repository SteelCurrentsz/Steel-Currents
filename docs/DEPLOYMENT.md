# Deploying Steel Currents to steelcurrents.com

The server is one Node process that serves the client *and* the WebSocket battle
service, so the whole game is a single deployment. The client works out where the
battle service lives from the page it was served by, which means it needs no
rebuild when it moves between localhost, staging and steelcurrents.com.

## What has to happen off-machine

Two steps need your accounts and cannot be done from the repo:

1. **Register `steelcurrents.com`** at a registrar (Namecheap, Cloudflare,
   Porkbun, Google Domains — roughly $10-15/year).
2. **Create a hosting account** on whichever platform you pick below.

Everything else is committed here.

## Option A — Render (recommended)

Render reads `render.yaml` and supports WebSockets on every plan.

1. Push this branch to GitHub (already done).
2. Go to <https://dashboard.render.com/blueprints> → **New Blueprint Instance**.
3. Pick the `Steel-Currents` repo. Render reads `render.yaml` and fills in the
   build command, start command and health check.
4. Deploy. You get a working URL like `steel-currents.onrender.com` immediately —
   the game is playable there before the domain is attached.
5. **Settings → Custom Domains → Add** `steelcurrents.com` and `www.steelcurrents.com`.
6. Render shows the DNS records to create. At your registrar add:

   | Type  | Name  | Value                        |
   |-------|-------|------------------------------|
   | A     | `@`   | (the IP Render shows)        |
   | CNAME | `www` | `steel-currents.onrender.com` |

7. DNS propagates in 5-60 minutes. Render issues the TLS certificate
   automatically, so `https://steelcurrents.com` then serves the game.

Note: the free plan sleeps after 15 minutes idle and takes ~30s to wake, which
drops live matches. The Starter plan (~$7/month, set in `render.yaml`) stays warm.

## Option B — Railway

1. <https://railway.app> → **New Project → Deploy from GitHub repo**.
2. Railway detects the Dockerfile and builds it. No further config needed.
3. **Settings → Networking → Custom Domain** → `steelcurrents.com`.
4. Add the CNAME Railway shows at your registrar.

## Option C — Any Docker host (Fly.io, DigitalOcean, EC2)

```bash
docker build -t steel-currents .
docker run -p 80:8080 steel-currents
```

Point an A record for `steelcurrents.com` at the host's IP. Put the container
behind a TLS terminator (Caddy and Cloudflare both do this with no config) —
browsers refuse a `wss://` connection from an `https://` page without it.

## Verifying a deployment

```bash
curl https://steelcurrents.com/healthz
# {"ok":true,"rooms":0,"uptime":12}

curl https://steelcurrents.com/api/status
# {"name":"Steel Currents","version":"1.25", ...}
```

Then open `https://steelcurrents.com` in two browser windows, click **Fleet
Battle** in each, and both should land in the same match within the 12-second
lobby countdown.

## Pointing the mobile builds at production

The native shells serve their bundle from a local scheme, so there is no server
on `location.host`. `client/js/net.js` handles this: any non-http(s) origin falls
back to `wss://steelcurrents.com/ws`.

To aim a build at a different backend — a staging server, or a local one while
developing — set the override before the app boots, in `client/index.html`:

```html
<script>globalThis.STEEL_CURRENTS_SERVER = 'wss://staging.steelcurrents.com/ws';</script>
```

Then re-sync the native projects:

```bash
npm run sync:ios
npm run sync:android
```

## Scaling notes

Match state lives in memory in `server/room.js`, so rooms are bound to one
instance. Running multiple instances behind a load balancer splits players
across them and they will not see each other. Until room state moves to shared
storage (Redis), run a single larger instance rather than several small ones.
