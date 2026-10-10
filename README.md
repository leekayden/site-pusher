# Site Pusher

A Chrome extension + relay server. Users who enter the admin password get "admin mode":
when they click the send button on a specific webpage, the page they're currently on is
opened (as a new tab) on every browser running the extension and connected to the relay.

```
Admin's Chrome ──► Relay server (Node) ──► every user's Chrome (extension opens the tab)
```

## Layout

- `server/` — relay. HTTP `POST /api/login` (password → admin token) and WebSocket `/ws`
  (broadcasts `open-url` to all connected extensions).
- `extension/` — Manifest V3 extension.
  - `background.js` — WebSocket connection with auto-reconnect, login/logout, broadcasting.
  - `popup.html/js` — password gate, admin status, "Push current tab" button.
  - `content.js` — watches for the send button on the target page and triggers the push.
- `test/simulate.js` — end-to-end simulation (admin + 2 users over the real relay).

## Production deployment

Deployed on the DigitalOcean droplet `cloudservetechcentral.com` (128.199.192.62):

- App dir: `/opt/site-pusher` — runs under **pm2** as `site-pusher` on **port 8788**
  (8787 was taken by calendar-summar). Port + `ADMIN_PASSWORD` are baked into the pm2
  saved environment; `pm2 restart site-pusher` after changing either in
  `pm2 delete site-pusher && PORT=8788 ADMIN_PASSWORD=... pm2 start server.js --name site-pusher`.
- **Apache** vhost `deploy/site-pusher.conf` proxies `site-pusher.cloudservetechcentral.com`
  to 127.0.0.1:8788 with WebSocket tunneling (`proxy_wstunnel`).
- TLS via certbot (`certbot --apache -d site-pusher.cloudservetechcentral.com`) — requires
  the DNS A record `site-pusher -> 128.199.192.62` in the DigitalOcean DNS panel first.
- The extension ships pointed at the production URL already (`wss://site-pusher...`).

## Run the relay locally

```bash
cd server
npm install
ADMIN_PASSWORD=your-secret node server.js     # or: set ADMIN_PASSWORD before starting
```

## Configure the extension

1. `extension/content.js` — set `SEND_BUTTON_SELECTOR` to the CSS selector of the send
   button on your target page (default `button[type="submit"]`).
2. `extension/manifest.json` — set the content script `matches` to the target webpage,
   e.g. `"https://your-app.example.com/*"`. (Default is `https://example.com/*`.)
3. `extension/background.js` — set `SERVER_HTTP` / `SERVER_WS` if the relay isn't on
   `localhost:8787`, and add the matching origin to `host_permissions` in the manifest.

## Install the extension

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select the `extension/` folder.
3. Pin it, click the icon, enter the admin password to enter admin mode.

Admins can push either by clicking the send button on the target page, or via the
"Push current tab to all users" button in the popup (handy for testing).

## Test the relay without Chrome

```bash
node server.js            # in one terminal (from server/)
node test/simulate.js     # from the repo root; expects all 5 checks to pass
```

## Behavior notes

- Tabs open **in the background** (`active: false` in `background.js`); change to `true`
  to take focus.
- Broadcasts are **live-only**: a user whose Chrome is closed at send time gets nothing.
- Reconnects are automatic with exponential backoff; pings every 25s keep connections alive.

## Security caveats

- The password check happens **server-side** and grants a 12h token — the extension itself
  stores no password. Still, anyone can unpack an extension, so don't embed secrets there.
- Run the relay behind HTTPS/WSS in production (`wss://...` URLs in `background.js`,
  `https://...` in `host_permissions`). A reverse proxy (Caddy/nginx) is the easiest way.
- Rate-limit `/api/login` before exposing it to the internet; the demo server doesn't.
