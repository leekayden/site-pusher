// Simulates the extension's WebSocket behavior: two users + one admin.
// Run while the relay server is up: node test/simulate.js
const WebSocket = require('../server/node_modules/ws');

const HTTP = 'http://localhost:8787';
const WS = 'ws://localhost:8787/ws';

function connect(name, onMessage) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS);
    const messages = [];
    ws.on('open', () => resolve({ ws, messages }));
    ws.on('message', (d) => {
      const msg = JSON.parse(d.toString());
      messages.push(msg);
      onMessage && onMessage(name, msg);
    });
    ws.on('error', reject);
  });
}

async function login(password) {
  const res = await fetch(`${HTTP}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const results = [];
function check(label, cond) {
  results.push({ label, pass: cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
}

(async () => {
  // 1. Wrong password rejected.
  const bad = await login('nope');
  check('wrong password gets 401', bad.status === 401);

  // 2. Correct password gets a token.
  const good = await login('change-me-now');
  check('correct password gets token', good.status === 200 && typeof good.body.token === 'string');

  // 3. Two users connect and receive the broadcast.
  let received = 0;
  const userA = await connect('userA', (n, m) => m.type === 'open-url' && received++);
  const userB = await connect('userB', (n, m) => m.type === 'open-url' && received++);
  await new Promise((r) => setTimeout(r, 200));

  const admin = await connect('admin');
  await new Promise((r) => setTimeout(r, 200));

  // 4. Unauthenticated broadcast is rejected.
  admin.ws.send(JSON.stringify({ type: 'broadcast', url: 'https://example.com/x', token: 'garbage' }));
  await new Promise((r) => setTimeout(r, 300));
  check('bad token does not broadcast', received === 0);

  // 5. Valid broadcast reaches both users, not the admin.
  admin.ws.send(JSON.stringify({ type: 'broadcast', url: 'https://example.com/page', token: good.body.token }));
  await new Promise((r) => setTimeout(r, 500));
  check('both users received open-url', received === 2);
  check('admin did NOT receive own broadcast', !admin.messages.some((m) => m.type === 'open-url'));

  userA.ws.close();
  userB.ws.close();
  admin.ws.close();

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) FAILED`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error('sim error:', err.message);
  process.exit(1);
});
