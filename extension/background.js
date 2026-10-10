// ===== Point these at your relay server =====
// Production relay runs on https://site-pusher.cloudservetechcentral.com
// (Apache -> pm2 node on port 8788). For local dev use http://localhost:8787.
const SERVER_HTTP = 'https://site-pusher.cloudservetechcentral.com';
const SERVER_WS = 'wss://site-pusher.cloudservetechcentral.com/ws';

// Must match TOKEN_TTL_MS in the server.
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

let ws = null;
let backoffMs = 1000;
let pingTimer = null;

function connect() {
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  ws = new WebSocket(SERVER_WS);

  ws.onopen = () => {
    backoffMs = 1000;
    startPing();
  };
  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.type === 'open-url' && /^https?:\/\//i.test(msg.url || '')) {
      // active:false opens it as a background tab; set true to steal focus.
      chrome.tabs.create({ url: msg.url, active: false });
    }
  };
  ws.onclose = () => {
    stopPing();
    setTimeout(connect, backoffMs);
    backoffMs = Math.min(backoffMs * 2, 60000);
  };
  ws.onerror = () => ws.close();
}

function startPing() {
  stopPing();
  pingTimer = setInterval(() => {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' }));
  }, 25000);
}

function stopPing() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function sendToRelay(payload) {
  if (!ws || ws.readyState !== 1) return false;
  ws.send(JSON.stringify(payload));
  return true;
}

async function isAdmin() {
  const { adminToken, adminUntil } = await chrome.storage.local.get(['adminToken', 'adminUntil']);
  return Boolean(adminToken && adminUntil && Date.now() < adminUntil);
}

async function broadcastCurrentTab() {
  if (!(await isAdmin())) return { ok: false, error: 'not admin' };
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https?:/i.test(tab.url || '')) {
    return { ok: false, error: 'current tab has no http(s) url' };
  }
  const { adminToken } = await chrome.storage.local.get('adminToken');
  const sent = sendToRelay({ type: 'broadcast', url: tab.url, token: adminToken });
  return sent ? { ok: true } : { ok: false, error: 'not connected to relay' };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'login': {
        try {
          const res = await fetch(`${SERVER_HTTP}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: msg.password })
          });
          if (!res.ok) {
            sendResponse({ ok: false, error: 'wrong password' });
            return;
          }
          const data = await res.json();
          await chrome.storage.local.set({
            adminToken: data.token,
            adminUntil: Date.now() + TOKEN_TTL_MS
          });
          sendResponse({ ok: true });
        } catch {
          sendResponse({ ok: false, error: 'cannot reach relay server' });
        }
        return;
      }
      case 'logout':
        await chrome.storage.local.remove(['adminToken', 'adminUntil']);
        sendResponse({ ok: true });
        return;
      case 'get-status': {
        const admin = await isAdmin();
        sendResponse({ ok: true, admin, connected: Boolean(ws && ws.readyState === 1) });
        return;
      }
      case 'push-current':
        sendResponse(await broadcastCurrentTab());
        return;
    }
  })();
  return true; // async sendResponse
});

chrome.runtime.onInstalled.addListener(connect);
connect();
