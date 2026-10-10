// ===== Configure these for the page with the "send" button =====
// CSS selector that matches the send button on the target page.
const SEND_BUTTON_SELECTOR = 'button[type="submit"]';

// Ignore clicks more often than this (ms) so one send can't fire twice.
const COOLDOWN_MS = 3000;

document.addEventListener(
  'click',
  (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (!target.closest(SEND_BUTTON_SELECTOR)) return;

    const now = Date.now();
    if (now - (window.__sitePusherLastSend || 0) < COOLDOWN_MS) return;
    window.__sitePusherLastSend = now;

    // Background verifies admin status and pushes the current tab's URL.
    chrome.runtime.sendMessage({ type: 'push-current' }, (res) => {
      if (!res || !res.ok) {
        console.warn('[Site Pusher] not sent:', res && res.error);
      }
    });
  },
  true
);
