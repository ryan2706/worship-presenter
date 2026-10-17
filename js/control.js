import { openChannel, shortcutFor } from './channel.js';
import { keepFitted } from './fit-text.js';

// Test slides. All public domain.
const slides = [
  {
    label: 'Amazing Grace, verse 1',
    text: 'Amazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found;\nWas blind, but now I see.',
  },
  {
    label: 'Holy, Holy, Holy, verse 1',
    text: 'Holy, holy, holy! Lord God Almighty!\nEarly in the morning our song shall rise to Thee;\nHoly, holy, holy! Merciful and mighty!\nGod in three Persons, blessèd Trinity!',
  },
  {
    label: 'Psalm 23:1–4 (KJV)',
    text:
      'The LORD is my shepherd; I shall not want.\n' +
      'He maketh me to lie down in green pastures: he leadeth me beside the still waters.\n' +
      'He restoreth my soul: he leadeth me in the paths of righteousness for his name’s sake.\n' +
      'Yea, though I walk through the valley of the shadow of death, I will fear no evil: ' +
      'for thou art with me; thy rod and thy staff they comfort me.',
  },
];

// What the TV should show. Kept for this tab so a reload carries on where it was.
const STORAGE_KEY = 'worship-presenter:control';
const state = { index: -1, cleared: false, black: false, ...loadState() };
let displayOpen = false;

const el = {
  slides: document.getElementById('slides'),
  status: document.getElementById('display-status'),
  tips: document.getElementById('tips'),
  popupBlocked: document.getElementById('popup-blocked'),
  liveNote: document.getElementById('live-note'),
  open: document.getElementById('open-display'),
  previous: document.getElementById('previous'),
  next: document.getElementById('next'),
  black: document.getElementById('black'),
  clear: document.getElementById('clear'),
};

const channel = openChannel((message) => {
  if (message.type === 'hello') {
    setDisplayOpen(true);
    sendState();
  } else if (message.type === 'bye') {
    setDisplayOpen(false);
    // Another TV window may still be open; it will answer the ping.
    channel.send({ type: 'ping' });
  } else if (message.type === 'key') {
    runAction(message.action);
  }
});

// Ask whether a TV window is already open (for example, after this page reloads).
channel.send({ type: 'ping' });

// Build the slide tiles.
const tiles = slides.map((slide, i) => {
  const item = document.createElement('li');
  item.innerHTML = `
    <button class="tile" type="button">
      <span class="tile-screen"><span class="tile-text"></span></span>
      <span class="tile-caption">
        <span class="tile-number">${i + 1}</span>
        <span class="tile-label"></span>
        <span class="tile-live">On the TV</span>
      </span>
    </button>`;
  const tile = item.querySelector('.tile');
  const text = item.querySelector('.tile-text');
  text.textContent = slide.text;
  item.querySelector('.tile-label').textContent = slide.label;
  tile.addEventListener('click', (event) => {
    showSlide(i);
    // After a mouse click, let Space and Enter go back to meaning "next slide".
    if (event.detail > 0) tile.blur();
  });
  el.slides.append(item);
  keepFitted(text, item.querySelector('.tile-screen'), { min: 4 });
  return tile;
});

// Buttons
el.open.addEventListener('click', openDisplay);
el.previous.addEventListener('click', () => runAction('previous'));
el.next.addEventListener('click', () => runAction('next'));
el.black.addEventListener('click', () => runAction('black'));
el.clear.addEventListener('click', clearText);

// Keyboard shortcuts. Space and Enter on a focused button only press that button.
document.addEventListener('keydown', (event) => {
  const action = shortcutFor(event);
  if (!action) return;
  event.preventDefault();
  runAction(action);
  // If a slide had keyboard focus, keep the focus on the slide that's now live.
  if (document.activeElement?.classList.contains('tile')) tiles[state.index]?.focus();
});

// The bottom bar covers the page, so tell the CSS how tall it is.
const bar = document.querySelector('.bar');
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--bar-height', `${bar.offsetHeight}px`);
}).observe(bar);

render();

function runAction(action) {
  if (action === 'next') showSlide(state.index < 0 ? 0 : Math.min(state.index + 1, slides.length - 1));
  if (action === 'previous') showSlide(state.index < 0 ? 0 : Math.max(state.index - 1, 0));
  if (action === 'black') {
    state.black = !state.black;
    update();
  }
}

function showSlide(i) {
  state.index = i;
  state.cleared = false;
  update();
}

function clearText() {
  state.cleared = true;
  update();
}

function update() {
  saveState();
  sendState();
  render();
  // On small screens, keep the slide that's on the TV in view.
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  tiles[state.index]?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
}

function sendState() {
  const text = state.index >= 0 && !state.cleared ? slides[state.index].text : '';
  channel.send({ type: 'state', text, black: state.black });
}

function openDisplay() {
  // Using the same window name brings back the TV window if it's already open.
  const win = window.open('display.html', 'wp-display', 'popup,width=960,height=540');
  el.popupBlocked.hidden = Boolean(win);
  win?.focus();
}

function setDisplayOpen(open) {
  displayOpen = open;
  render();
}

function render() {
  tiles.forEach((tile, i) => {
    const live = i === state.index;
    tile.classList.toggle('is-live', live);
    tile.classList.toggle('is-hidden', live && (state.black || state.cleared));
    tile.querySelector('.tile-live').textContent =
      live && state.black ? 'Black screen' : live && state.cleared ? 'Text cleared' : 'On the TV';
  });

  el.status.textContent = displayOpen ? 'TV window is open' : 'TV window is closed';
  el.status.classList.toggle('is-open', displayOpen);
  el.tips.hidden = displayOpen;
  if (displayOpen) el.popupBlocked.hidden = true;

  el.black.setAttribute('aria-pressed', String(state.black));
  el.liveNote.classList.toggle('is-warning', state.black);
  el.liveNote.textContent = liveNote();
}

function liveNote() {
  if (state.black) return 'The TV is black. Press Black screen or B to bring it back.';
  if (state.index < 0) return 'Nothing is on the TV yet. Pick a slide.';
  if (state.cleared) return 'The words are cleared. Pick a slide to show it again.';
  return `The TV is showing slide ${state.index + 1}: ${slides[state.index].label}.`;
}

function loadState() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    if (saved && Number.isInteger(saved.index) && saved.index < slides.length) return saved;
  } catch {}
  return {};
}

function saveState() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}
