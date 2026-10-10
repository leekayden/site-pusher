const messageEl = document.getElementById('message');
const loginForm = document.getElementById('login-form');
const adminPanel = document.getElementById('admin-panel');
const modeBadge = document.getElementById('mode-badge');
const relayBadge = document.getElementById('relay-badge');

function sendMessage(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

async function renderStatus() {
  const status = await sendMessage({ type: 'get-status' });
  if (!status) {
    messageEl.textContent = 'Extension is starting up — try again in a second.';
    return;
  }
  loginForm.classList.toggle('hidden', status.admin);
  adminPanel.classList.toggle('hidden', !status.admin);
  modeBadge.textContent = status.admin ? 'ADMIN' : 'user';
  modeBadge.className = 'badge ' + (status.admin ? 'admin' : 'user');
  relayBadge.textContent = status.connected ? 'connected' : 'disconnected';
}

document.getElementById('login-btn').addEventListener('click', async () => {
  const password = document.getElementById('password').value;
  if (!password) return;
  const res = await sendMessage({ type: 'login', password });
  if (res && res.ok) {
    messageEl.textContent = '';
    document.getElementById('password').value = '';
  } else {
    messageEl.textContent = (res && res.error) || 'login failed';
  }
  await renderStatus();
});

document.getElementById('password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('login-btn').click();
});

document.getElementById('push-btn').addEventListener('click', async () => {
  const res = await sendMessage({ type: 'push-current' });
  if (res && res.ok) {
    messageEl.textContent = '';
    window.close();
  } else {
    messageEl.textContent = (res && res.error) || 'push failed';
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await sendMessage({ type: 'logout' });
  await renderStatus();
});

renderStatus();
