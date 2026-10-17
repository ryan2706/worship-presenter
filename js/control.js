import { openChannel, shortcutFor } from './channel.js';
import { keepFitted } from './fit-text.js';
import { createBackup } from './backup.js';
import { createEditor } from './editor.js';
import {
  countDeletedSamples,
  deleteSong,
  listSongs,
  restoreDeletedSamples,
  restoreSample,
  saveSong,
  slidesFor,
} from './library.js';

// What the TV should show (songId + index), and which song's slides are on
// this page (viewId). Kept for this tab so a reload carries on where it was.
const STORAGE_KEY = 'worship-presenter:control';
const state = { songId: null, index: -1, cleared: false, black: false, viewId: null, ...loadState() };
let displayOpen = false;

let songs = [];
let ready = false;
const slidesBySong = new Map();
const songButtons = new Map();
const searchText = new Map();
let tiles = [];
let fitters = [];

const el = {
  main: document.getElementById('main'),
  songsPanel: document.querySelector('.songs-panel'),
  slidesPanel: document.querySelector('.slides-panel'),
  keepSafe: document.getElementById('keep-safe'),
  songs: document.getElementById('songs'),
  search: document.getElementById('search'),
  noMatch: document.getElementById('no-match'),
  bringBack: document.getElementById('bring-back'),
  addSong: document.getElementById('add-song'),
  editSong: document.getElementById('edit-song'),
  songTitle: document.getElementById('song-title'),
  elsewhere: document.getElementById('elsewhere'),
  elsewhereText: document.getElementById('elsewhere-text'),
  goLiveSong: document.getElementById('go-live-song'),
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

// Buttons
el.open.addEventListener('click', openDisplay);
el.previous.addEventListener('click', () => runAction('previous'));
el.next.addEventListener('click', () => runAction('next'));
el.black.addEventListener('click', () => runAction('black'));
el.clear.addEventListener('click', clearText);
el.goLiveSong.addEventListener('click', (event) => {
  showSong(state.songId);
  // Keyboard users land on the slide that's on the TV.
  if (event.detail === 0) tiles[state.index]?.focus();
  else el.songTitle.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
});

// Adding, editing and deleting songs. The TV only changes once a change is saved.
const editor = createEditor({
  onOpen: () => (el.main.hidden = true),
  onClose: () => {
    el.main.hidden = false;
    el.songTitle.scrollIntoView({ block: 'start' });
  },
  onSave: async (song) => {
    await saveSong(song);
    backup.noteChange();
    await reloadLibrary(song.id);
  },
  onRestore: async (id) => {
    await restoreSample(id);
    backup.noteChange();
    await reloadLibrary(id);
  },
  onDelete: async (id) => {
    await deleteSong(id);
    backup.noteChange();
    await reloadLibrary();
  },
});

// Back up, restore and share songs. Like the editor, it takes the place of
// the songs and slides while it's open, and the bottom bar still runs the TV.
const backup = createBackup({
  onOpen: () => (el.main.hidden = true),
  onClose: () => (el.main.hidden = false),
  getSongs: () => songs,
  onImported: () => reloadLibrary(state.viewId),
  // The reminder waits until nothing has been put on the TV.
  isTvInUse: () => state.index >= 0,
});
el.addSong.addEventListener('click', () => editor.open());
el.editSong.addEventListener('click', () => {
  const song = songs.find((s) => s.id === state.viewId);
  if (song) editor.open(song);
});
el.search.addEventListener('input', applySearch);
el.bringBack.addEventListener('click', async () => {
  try {
    await restoreDeletedSamples();
    backup.noteChange();
  } catch (error) {
    console.warn('The deleted samples could not be brought back.', error);
  }
  await reloadLibrary();
});

// Keyboard shortcuts. Space and Enter on a focused button only press that button.
document.addEventListener('keydown', (event) => {
  const action = shortcutFor(event);
  if (!action) return;
  event.preventDefault();
  runAction(action);
  // If a slide had keyboard focus, keep the focus on the slide that's now live.
  if (document.activeElement?.classList.contains('tile') && state.songId === state.viewId) {
    tiles[state.index]?.focus();
  }
});

// The bottom bar covers the page, so tell the CSS how tall it is.
const bar = document.querySelector('.bar');
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--bar-height', `${bar.offsetHeight}px`);
}).observe(bar);

// On phones the slides come after the songs, so "Keep your songs safe" moves
// below the slides, out of the way. Moving it keeps the Tab order matching the screen.
const phone = matchMedia('(max-width: 55.99rem)');
phone.addEventListener('change', placeKeepSafe);
placeKeepSafe();

function placeKeepSafe() {
  if (phone.matches) el.slidesPanel.after(el.keepSafe);
  else el.songsPanel.append(el.keepSafe);
}

render();
start();

async function start() {
  await loadSongs();
  checkState();
  ready = true;
  buildSongList();
  buildTiles();
  render();
  sendState();
  backup.refreshReminder();
}

async function loadSongs() {
  songs = await listSongs();
  slidesBySong.clear();
  searchText.clear();
  songs.forEach((song) => {
    slidesBySong.set(song.id, slidesFor(song));
    searchText.set(song.id, forSearch([song.title, ...song.sections.map((s) => s.text)].join(' ')));
  });
  el.bringBack.hidden = (await countDeletedSamples()) === 0;
}

// After a song is saved, restored or deleted. If the song on the TV changed,
// the TV gets the new words and stays on the same slide if it still exists.
async function reloadLibrary(viewId) {
  const before = liveSlide();
  await loadSongs();
  const slides = slidesBySong.get(state.songId);
  if (before && slides?.length) state.index = sameSlide(slides, before, state.index);
  if (slidesBySong.has(viewId)) state.viewId = viewId;
  checkState();
  buildSongList();
  buildTiles();
  render();
  sendState();
}

// Where the slide that was on the TV is now, in a changed song.
function sameSlide(slides, before, index) {
  if (slides[index]?.name === before.name) return index;
  let best = -1;
  slides.forEach((slide, i) => {
    if (slide.name === before.name && (best < 0 || Math.abs(i - index) < Math.abs(best - index))) best = i;
  });
  if (best >= 0) return best;
  return Math.min(index, slides.length - 1);
}

// Search ignores capitals, accents, punctuation and curly quotes.
function forSearch(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function applySearch() {
  const query = forSearch(el.search.value);
  let shown = 0;
  songButtons.forEach((button, id) => {
    const match = !query || searchText.get(id).includes(query);
    button.parentElement.hidden = !match;
    if (match) shown += 1;
  });
  el.noMatch.hidden = shown > 0;
  if (!shown) el.noMatch.textContent = `No songs match ‘${el.search.value.trim()}’.`;
}

// Songs

function buildSongList() {
  el.songs.replaceChildren();
  songButtons.clear();
  songs.forEach((song) => {
    const item = document.createElement('li');
    item.innerHTML = `
      <button class="song" type="button">
        <span class="song-name"></span>
        <span class="song-live">On the TV</span>
      </button>`;
    const button = item.querySelector('.song');
    item.querySelector('.song-name').textContent = song.title;
    button.addEventListener('click', (event) => {
      showSong(song.id);
      // When the slides are below the songs (phones), bring them into view.
      if (phone.matches) {
        el.songTitle.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
      }
      // After a mouse click, let Space and Enter go back to meaning "next slide".
      if (event.detail > 0) button.blur();
    });
    el.songs.append(item);
    songButtons.set(song.id, button);
  });
  applySearch();
}

// Shows a song's slides on this page. The TV doesn't change.
function showSong(id) {
  if (!slidesBySong.has(id)) return;
  state.viewId = id;
  saveState();
  buildTiles();
  render();
}

// Build the slide tiles for the song being viewed.
function buildTiles() {
  fitters.forEach((fitter) => fitter.stop());
  fitters = [];
  el.slides.replaceChildren();

  const songId = state.viewId;
  const slides = slidesBySong.get(songId) ?? [];
  el.songTitle.textContent = songTitle(songId) ?? 'No songs yet';
  el.editSong.hidden = !slidesBySong.has(songId);

  tiles = slides.map((slide, i) => {
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
    item.querySelector('.tile-label').textContent = slide.name;
    tile.addEventListener('click', (event) => {
      showSlide(songId, i);
      // After a mouse click, let Space and Enter go back to meaning "next slide".
      if (event.detail > 0) tile.blur();
    });
    el.slides.append(item);
    fitters.push(keepFitted(text, item.querySelector('.tile-screen'), { min: 4 }));
    return tile;
  });
}

// Slides

function runAction(action) {
  if (action === 'next') next();
  if (action === 'previous') previous();
  if (action === 'black') {
    state.black = !state.black;
    update();
  }
}

// Next keeps going through the song on the TV. After its last slide, it
// starts the song being viewed, if that's a different song.
function next() {
  const live = slidesBySong.get(state.songId);
  if (!live || state.index < 0) return showSlide(state.viewId, 0);
  if (state.index < live.length - 1) return showSlide(state.songId, state.index + 1);
  if (state.viewId !== state.songId) return showSlide(state.viewId, 0);
  showSlide(state.songId, state.index);
}

// Previous stays within the song on the TV.
function previous() {
  if (!slidesBySong.has(state.songId) || state.index < 0) return showSlide(state.viewId, 0);
  showSlide(state.songId, Math.max(state.index - 1, 0));
}

function showSlide(songId, i) {
  if (!slidesBySong.get(songId)?.[i]) return;
  state.songId = songId;
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
  backup.refreshReminder();
  // On small screens, keep the slide that's on the TV in view.
  if (state.songId === state.viewId) {
    tiles[state.index]?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
  }
}

function sendState() {
  // Until the songs have loaded we don't know what's on the TV, so say nothing.
  if (!ready) return;
  const slide = liveSlide();
  const text = slide && !state.cleared ? slide.text : '';
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
  const viewingLive = state.songId === state.viewId;
  tiles.forEach((tile, i) => {
    const live = viewingLive && i === state.index;
    tile.classList.toggle('is-live', live);
    tile.classList.toggle('is-hidden', live && (state.black || state.cleared));
    tile.querySelector('.tile-live').textContent =
      live && state.black ? 'Black screen' : live && state.cleared ? 'Text cleared' : 'On the TV';
  });

  songButtons.forEach((button, id) => {
    if (id === state.viewId) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
    button.classList.toggle('is-live', id === state.songId && state.index >= 0);
  });

  const slide = liveSlide();
  el.elsewhere.hidden = !slide || viewingLive;
  if (slide && !viewingLive) {
    el.elsewhereText.textContent =
      `The TV is showing ${songTitle(state.songId)}, ${slide.name}. ` +
      'Next keeps going through that song, then starts this one.';
  }

  el.status.textContent = displayOpen ? 'TV window is open' : 'TV window is closed';
  el.status.classList.toggle('is-open', displayOpen);
  el.tips.hidden = displayOpen;
  if (displayOpen) el.popupBlocked.hidden = true;

  el.black.setAttribute('aria-pressed', String(state.black));
  el.liveNote.classList.toggle('is-warning', state.black);
  el.liveNote.textContent = liveNote();
}

function liveNote() {
  const slide = liveSlide();
  if (state.black) return 'The TV is black. Press Black screen or B to bring it back.';
  if (!slide) return 'Nothing is on the TV yet. Pick a slide.';
  if (state.cleared) return 'The words are cleared. Pick a slide to show it again.';
  const count = slidesBySong.get(state.songId).length;
  return `The TV is showing ${songTitle(state.songId)}, ${slide.name} (slide ${state.index + 1} of ${count}).`;
}

function liveSlide() {
  return slidesBySong.get(state.songId)?.[state.index] ?? null;
}

function songTitle(id) {
  return songs.find((song) => song.id === id)?.title;
}

function scrollBehavior() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

// Saved state may name a song or slide that no longer exists.
function checkState() {
  if (!liveSlide()) {
    state.songId = null;
    state.index = -1;
    state.cleared = false;
  }
  if (!slidesBySong.has(state.viewId)) state.viewId = state.songId ?? songs[0]?.id ?? null;
  state.black = state.black === true;
  saveState();
}

function loadState() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === 'object') return saved;
  } catch {}
  return {};
}

function saveState() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}
