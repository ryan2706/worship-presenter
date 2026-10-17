import { openChannel, shortcutFor } from './channel.js';
import { keepFitted } from './fit-text.js';

const body = document.body;
const screen = document.getElementById('screen');
const textEl = document.getElementById('text');
const fullscreenBtn = document.getElementById('fullscreen');

const refit = keepFitted(textEl, screen);

const channel = openChannel((message) => {
  if (message.type === 'state') show(message);
  if (message.type === 'ping') channel.send({ type: 'hello' });
});

channel.send({ type: 'hello' });
window.addEventListener('pagehide', () => channel.send({ type: 'bye' }));

function show({ text = '', black = false }) {
  // Keep the "waiting" help on screen until there's something to show.
  if (text || black) body.classList.remove('waiting');
  body.classList.toggle('black', black);
  if (textEl.textContent !== text) {
    textEl.textContent = text;
    refit();
  }
  keepAwake();
}

// Keys pressed on the TV window are passed back to the Control window.
document.addEventListener('keydown', (event) => {
  if ((event.key === 'f' || event.key === 'F') && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    toggleFullscreen();
    return;
  }
  const action = shortcutFor(event);
  if (!action) return;
  event.preventDefault();
  channel.send({ type: 'key', action });
});

// Full screen
fullscreenBtn.addEventListener('click', toggleFullscreen);

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

document.addEventListener('fullscreenchange', () => {
  body.classList.toggle('is-fullscreen', Boolean(document.fullscreenElement));
});

// Hide the pointer and the button when the mouse hasn't moved for a while.
let idleTimer;
function wake() {
  body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => body.classList.add('idle'), 3000);
}
document.addEventListener('mousemove', wake);
wake();

// Stop the computer going to sleep while the TV is showing something.
let wakeLock = null;
let asking = false;

async function keepAwake() {
  if (!('wakeLock' in navigator)) {
    document.documentElement.dataset.wakeLock = 'unsupported';
    return;
  }
  if (wakeLock || asking || document.visibilityState !== 'visible' || body.classList.contains('waiting')) return;
  asking = true;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    document.documentElement.dataset.wakeLock = 'held';
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
      document.documentElement.dataset.wakeLock = 'released';
    });
  } catch {
    document.documentElement.dataset.wakeLock = 'refused';
  } finally {
    asking = false;
  }
}

// The browser drops the lock when the window is hidden, so ask again on return.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') keepAwake();
});
