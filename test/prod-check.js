// End-to-end test against the PRODUCTION relay over the real domain.
const WebSocket = require('../server/node_modules/ws');

const HTTP = 'https://site-pusher.cloudservetechcentral.com';
const WS = 'wss://site-pusher.cloudservetechcentral.com/ws';
const PASSWORD = process.env.PROD_PASSWORD;

let received = null;
let failed = [];
function check(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failed.push(label);
}

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS);
    const messages = [];
    ws.on('open', () => resolve({ ws, messages }));
    ws.on('message', (d) => messages.push(JSON.parse(d.toString())));
    ws.on('error', reject);
  });
}

(async () => {
  const res = await fetch(`${HTTP}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD })
  });
  check('https login returns 200', res.status === 200);
  const { token } = await res.json();

  const user = await connect();
  const admin = await connect();
  await new Promise((r) => setTimeout(r, 300));

  admin.ws.send(JSON.stringify({ type: 'broadcast', url: 'https://example.com/prod-test', token }));
  await new Promise((r) => setTimeout(r, 800));

  received = user.messages.find((m) => m.type === 'open-url');
  check('user received open-url over wss', received && received.url === 'https://example.com/prod-test');
  check('admin did NOT receive own broadcast', !admin.messages.some((m) => m.type === 'open-url'));

  admin.ws.close();
  user.ws.close();
  console.log(failed.length === 0 ? '\nPRODUCTION RELAY VERIFIED' : `\n${failed.length} FAILED`);
  process.exit(failed.length === 0 ? 0 : 1);
})().catch((e) => {
  console.error('error:', e.message);
  process.exit(1);
});
