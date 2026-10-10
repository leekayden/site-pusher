// Relay server for the Site Pusher extension.
// - POST /api/login  { password } -> { token, expiresAt }
// - WS     /ws      clients (users + admins) connect here.
//          Admins send { type: "broadcast", url, token } and every OTHER
//          connected client receives { type: "open-url", url }.

const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8787;
// Set ADMIN_PASSWORD in the environment for anything beyond local testing.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me-now';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h, must match TOKEN_TTL_MS in background.js

const tokens = new Map(); // token -> expiresAt

function issueToken() {
  const token = crypto.randomBytes(32).toString('hex');
  tokens.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}

function validToken(token) {
  const expiresAt = tokens.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    tokens.delete(token);
    return false;
  }
  return true;
}

// Periodically drop expired tokens so the map doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [token, expiresAt] of tokens) {
    if (now > expiresAt) tokens.delete(token);
  }
}, 60 * 60 * 1000).unref();

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/login') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024) req.destroy();
    });
    req.on('end', () => {
      let password = '';
      try {
        password = String(JSON.parse(body).password || '');
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid JSON' }));
        return;
      }

      if (password !== ADMIN_PASSWORD) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'wrong password' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ token: issueToken(), expiresAt: Date.now() + TOKEN_TTL_MS }));
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' }));
      return;
    }

    if (msg.type === 'broadcast') {
      if (!validToken(String(msg.token || ''))) {
        ws.send(JSON.stringify({ type: 'error', error: 'unauthorized' }));
        return;
      }
      const url = String(msg.url || '');
      if (!/^https?:\/\//i.test(url)) {
        ws.send(JSON.stringify({ type: 'error', error: 'invalid url' }));
        return;
      }
      const payload = JSON.stringify({ type: 'open-url', url, at: Date.now() });
      for (const client of wss.clients) {
        if (client !== ws && client.readyState === 1) client.send(payload);
      }
      console.log(`[broadcast] ${url} -> ${wss.clients.size - 1} client(s)`);
    }
  });
});

// Drop dead connections so the reconnect logic on clients keeps things healthy.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
heartbeat.unref();

server.listen(PORT, () => {
  if (ADMIN_PASSWORD === 'change-me-now') {
    console.warn('WARNING: using default admin password. Set ADMIN_PASSWORD env var.');
  }
  console.log(`Relay listening on http://localhost:${PORT} (ws://localhost:${PORT}/ws)`);
});
