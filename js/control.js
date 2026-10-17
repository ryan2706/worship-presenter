import { openChannel, shortcutFor } from './channel.js';
import { keepFitted } from './fit-text.js';
import { createBackup } from './backup.js';
import { createBiblePanel } from './bible-panel.js';
import { formatReference } from './bible-reference.js';
import { findTranslation } from './bibles.js';
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
import { sameVerseSlide, slidesForPassage } from './passage.js';

// Songs and Bible passages are both "items": something with slides. The TV
// shows one slide of one item (liveId + index), and this page shows the slides
// of the item being viewed (viewId). Both work the same way for songs and
// passages. Kept for this tab, with the open tab and the list of passages
// shown, so a reload carries on where it was.
const STORAGE_KEY = 'worship-presenter:control';
const MAX_PASSAGES = 10;
const state = {
  liveId: null,
  index: -1,
  cleared: false,
  black: false,
  viewId: null,
  tab: 'songs',
  passages: [],
  ...loadState(),
};
let displayOpen = false;

let songs = [];
let ready = false;
const songSlides = new Map();
// Passages whose words have been loaded: id -> { id, translation, ref, verses, slides }.
const passages = new Map();
const itemButtons = new Map();
const searchText = new Map();
let tiles = [];
let fitters = [];

const el = {
  main: document.getElementById('main'),
  songsPanel: document.querySelector('.songs-panel'),
  slidesPanel: document.querySelector('.slides-panel'),
  tabSongs: document.getElementById('tab-songs'),
  tabBible: document.getElementById('tab-bible'),
  songsTab: document.getElementById('songs-tab'),
  bibleTab: document.getElementById('bible-tab'),
  keepSafe: document.getElementById('keep-safe'),
  songs: document.getElementById('songs'),
  search: document.getElementById('search'),
  noMatch: document.getElementById('no-match'),
  bringBack: document.getElementById('bring-back'),
  addSong: document.getElementById('add-song'),
  passages: document.getElementById('passages'),
  noPassages: document.getElementById('no-passages'),
  editSong: document.getElementById('edit-song'),
  songTitle: document.getElementById('song-title'),
  passageNotice: document.getElementById('passage-notice'),
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
  showItem(state.liveId);
  // Keyboard users land on the slide that's on the TV.
  if (event.detail === 0) tiles[state.index]?.focus();
  else el.songTitle.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
});
el.tabSongs.addEventListener('click', () => setTab('songs'));
el.tabBible.addEventListener('click', () => setTab('bible'));

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

// The Bible tab. Like picking a song, showing a passage doesn't change the TV.
const bible = createBiblePanel({
  onShow: async ({ translationId, ref }) => {
    const entry = { id: passageId(translationId, ref), translation: translationId, ref };
    await loadPassage(entry);
    rememberPassage(entry);
    buildPassageList();
    showItem(entry.id);
    scrollToSlidesOnPhone();
  },
  onLayoutChange: relayOutPassages,
});

// Keyboard shortcuts. Space and Enter on a focused button only press that button.
document.addEventListener('keydown', (event) => {
  const action = shortcutFor(event);
  if (!action) return;
  event.preventDefault();
  runAction(action);
  // If a slide had keyboard focus, keep the focus on the slide that's now live.
  if (document.activeElement?.classList.contains('tile') && state.liveId === state.viewId) {
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
  else el.songsTab.append(el.keepSafe);
}

render();
start();

async function start() {
  await loadSongs();
  await restorePassages();
  checkState();
  ready = true;
  buildSongList();
  buildPassageList();
  buildTiles();
  render();
  sendState();
  backup.refreshReminder();
}

async function loadSongs() {
  songs = await listSongs();
  songSlides.clear();
  searchText.clear();
  songs.forEach((song) => {
    songSlides.set(song.id, slidesFor(song));
    searchText.set(song.id, forSearch([song.title, ...song.sections.map((s) => s.text)].join(' ')));
  });
  el.bringBack.hidden = (await countDeletedSamples()) === 0;
}

// After a song is saved, restored or deleted. If the song on the TV changed,
// the TV gets the new words and stays on the same slide if it still exists.
async function reloadLibrary(viewId) {
  const before = liveSlide();
  const liveWasSong = songSlides.has(state.liveId);
  await loadSongs();
  const slides = songSlides.get(state.liveId);
  if (liveWasSong && before && slides?.length) state.index = sameSlide(slides, before, state.index);
  if (songSlides.has(viewId)) state.viewId = viewId;
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
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function applySearch() {
  const query = forSearch(el.search.value);
  let shown = 0;
  songs.forEach(({ id }) => {
    const button = itemButtons.get(id);
    const match = !query || searchText.get(id).includes(query);
    button.parentElement.hidden = !match;
    if (match) shown += 1;
  });
  el.noMatch.hidden = shown > 0;
  if (!shown) el.noMatch.textContent = `No songs match ‘${el.search.value.trim()}’.`;
}

// Tabs

function setTab(tab) {
  state.tab = tab;
  saveState();
  render();
}

// Songs

function buildSongList() {
  el.songs.replaceChildren();
  songs.forEach((song) => {
    itemButtons.delete(song.id);
    el.songs.append(itemButton(song.id, song.title));
  });
  // Forget buttons for songs that are gone.
  itemButtons.forEach((button, id) => {
    if (!button.isConnected) itemButtons.delete(id);
  });
  applySearch();
}

// A button in the song or passage list. Picking it shows that item's slides
// on this page; the TV doesn't change.
function itemButton(id, title, detail) {
  const item = document.createElement('li');
  item.innerHTML = `
    <button class="song" type="button">
      <span class="song-name"></span>
      <span class="song-live">On the TV</span>
    </button>`;
  const button = item.querySelector('.song');
  item.querySelector('.song-name').textContent = title;
  if (detail) {
    const small = document.createElement('span');
    small.className = 'song-detail';
    small.textContent = detail;
    item.querySelector('.song-name').append(' ', small);
  }
  button.addEventListener('click', async (event) => {
    // After a mouse click, let Space and Enter go back to meaning "next slide".
    if (event.detail > 0) button.blur();
    if (!(await ensureLoaded(id))) return;
    showItem(id);
    scrollToSlidesOnPhone();
  });
  itemButtons.set(id, button);
  return item;
}

// When the slides are below the lists (phones), bring them into view.
function scrollToSlidesOnPhone() {
  if (phone.matches) el.songTitle.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
}

// Shows an item's slides on this page, on its own tab. The TV doesn't change.
function showItem(id) {
  if (!slidesOf(id)) return;
  state.viewId = id;
  state.tab = tabOf(id);
  saveState();
  buildTiles();
  render();
}

// Bible passages

// Same translation and reference, same passage, so showing it again reuses it.
function passageId(translationId, ref) {
  return `passage:${translationId}:${formatReference(ref)}`;
}

// Fetches a passage's words (the Bible file loads the first time) and makes its
// slides. Throws an Error with a plain message if it can't.
async function loadPassage(entry) {
  const translation = findTranslation(entry.translation);
  if (!translation) throw new Error('That translation isn’t available any more.');
  const verses = await translation.getVerses(entry.ref);
  if (!verses.some((verse) => verse.text)) {
    throw new Error(`${formatReference(entry.ref)} isn’t in the main text of the ${translation.name}.`);
  }
  passages.set(entry.id, { ...entry, verses, slides: makePassageSlides(entry, verses, translation) });
}

function makePassageSlides(entry, verses, translation = findTranslation(entry.translation)) {
  return slidesForPassage(verses, { ref: entry.ref, translation, twoPerSlide: bible.twoPerSlide });
}

// A passage in the list whose words haven't been loaded yet (after a reload).
async function ensureLoaded(id) {
  if (slidesOf(id)) return true;
  const entry = state.passages.find((p) => p.id === id);
  if (!entry) return false;
  try {
    await loadPassage(entry);
    bible.showError('');
    return true;
  } catch (error) {
    bible.showError(error.message);
    return false;
  }
}

// Newest first. The passage on the TV always stays in the list.
function rememberPassage(entry) {
  const others = state.passages.filter((p) => p.id !== entry.id);
  const kept = [entry, ...others].slice(0, MAX_PASSAGES);
  const live = others.find((p) => p.id === state.liveId);
  if (live && !kept.includes(live)) kept[kept.length - 1] = live;
  state.passages = kept;
  saveState();
}

// After a reload, load the words of the passage on the TV and the one being
// viewed. Others load when picked. Anything that can't be loaded is dropped.
async function restorePassages() {
  state.passages = (Array.isArray(state.passages) ? state.passages : []).filter(validEntry).map((entry) => ({
    ...entry,
    id: passageId(entry.translation, entry.ref),
  }));
  const needed = state.passages.filter((p) => p.id === state.liveId || p.id === state.viewId);
  await Promise.all(
    needed.map((entry) =>
      loadPassage(entry).catch((error) => console.warn(`${entry.id} could not be loaded.`, error))
    )
  );
}

function validEntry(entry) {
  const ref = entry?.ref;
  const whole = (n) => Number.isInteger(n) && n > 0;
  return (
    findTranslation(entry?.translation) &&
    ref &&
    Number.isInteger(ref.book) &&
    whole(ref.startChapter) &&
    whole(ref.endChapter) &&
    (ref.startVerse === null || whole(ref.startVerse)) &&
    (ref.endVerse === null || whole(ref.endVerse))
  );
}

function buildPassageList() {
  el.passages.replaceChildren();
  passageIds().forEach((id) => itemButtons.delete(id));
  state.passages.forEach((entry) => {
    el.passages.append(itemButton(entry.id, formatReference(entry.ref), findTranslation(entry.translation).short));
  });
  el.noPassages.hidden = state.passages.length > 0;
}

function passageIds() {
  return [...itemButtons.keys()].filter((id) => id.startsWith('passage:'));
}

// "Two short verses per slide" changed: lay out every passage again. If one is
// on the TV, the TV keeps showing the same verse.
function relayOutPassages() {
  const before = liveSlide();
  passages.forEach((passage) => {
    passage.slides = makePassageSlides(passage, passage.verses);
  });
  const live = passages.get(state.liveId);
  if (live && state.index >= 0) state.index = sameVerseSlide(live.slides, before, state.index);
  saveState();
  buildTiles();
  render();
  sendState();
}

// Slides

// Build the slide tiles for the item being viewed.
function buildTiles() {
  fitters.forEach((fitter) => fitter.stop());
  fitters = [];
  el.slides.replaceChildren();

  const itemId = state.viewId;
  const slides = slidesOf(itemId) ?? [];
  el.songTitle.textContent = titleOf(itemId) ?? 'No songs yet';
  el.editSong.hidden = !songSlides.has(itemId);
  const notice = findTranslation(passages.get(itemId)?.translation)?.notice;
  el.passageNotice.textContent = notice ?? '';
  el.passageNotice.hidden = !notice;

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
    const screen = item.querySelector('.tile-screen');
    const text = item.querySelector('.tile-text');
    text.textContent = slide.text;
    item.querySelector('.tile-label').textContent = slide.name;
    // Bible slides show their reference small at the bottom, as on the TV.
    if (slide.caption) {
      const ref = document.createElement('span');
      ref.className = 'tile-ref';
      ref.textContent = slide.caption;
      screen.classList.add('has-ref');
      screen.append(ref);
    }
    tile.addEventListener('click', (event) => {
      showSlide(itemId, i);
      // After a mouse click, let Space and Enter go back to meaning "next slide".
      if (event.detail > 0) tile.blur();
    });
    el.slides.append(item);
    fitters.push(keepFitted(text, screen, { min: 4 }));
    return tile;
  });
}

function runAction(action) {
  if (action === 'next') next();
  if (action === 'previous') previous();
  if (action === 'black') {
    state.black = !state.black;
    update();
  }
}

// Next keeps going through the item on the TV. After its last slide, it
// starts the item being viewed, if that's a different one.
function next() {
  const live = slidesOf(state.liveId);
  if (!live || state.index < 0) return showSlide(state.viewId, 0);
  if (state.index < live.length - 1) return showSlide(state.liveId, state.index + 1);
  if (state.viewId !== state.liveId) return showSlide(state.viewId, 0);
  showSlide(state.liveId, state.index);
}

// Previous stays within the item on the TV.
function previous() {
  if (!slidesOf(state.liveId) || state.index < 0) return showSlide(state.viewId, 0);
  showSlide(state.liveId, Math.max(state.index - 1, 0));
}

function showSlide(itemId, i) {
  if (!slidesOf(itemId)?.[i]) return;
  state.liveId = itemId;
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
  if (state.liveId === state.viewId) {
    tiles[state.index]?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
  }
}

function sendState() {
  // Until the songs have loaded we don't know what's on the TV, so say nothing.
  if (!ready) return;
  const slide = liveSlide();
  const showing = slide && !state.cleared;
  channel.send({
    type: 'state',
    text: showing ? slide.text : '',
    caption: showing ? slide.caption ?? '' : '',
    black: state.black,
  });
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
  const viewingLive = state.liveId === state.viewId;
  tiles.forEach((tile, i) => {
    const live = viewingLive && i === state.index;
    tile.classList.toggle('is-live', live);
    tile.classList.toggle('is-hidden', live && (state.black || state.cleared));
    tile.querySelector('.tile-live').textContent =
      live && state.black ? 'Black screen' : live && state.cleared ? 'Text cleared' : 'On the TV';
  });

  itemButtons.forEach((button, id) => {
    if (id === state.viewId) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
    button.classList.toggle('is-live', id === state.liveId && state.index >= 0);
  });

  // Tabs. A tab that isn't open is marked when what's on the TV is in it.
  const liveTab = liveSlide() ? tabOf(state.liveId) : null;
  [
    [el.tabSongs, el.songsTab, 'songs'],
    [el.tabBible, el.bibleTab, 'bible'],
  ].forEach(([tab, panel, name]) => {
    const open = state.tab === name;
    tab.setAttribute('aria-pressed', String(open));
    tab.classList.toggle('is-live', liveTab === name && !open);
    panel.hidden = !open;
  });
  // Keep your songs safe is about songs, so it goes with the Songs tab (it
  // sits outside it on phones).
  el.keepSafe.hidden = state.tab !== 'songs';

  const slide = liveSlide();
  el.elsewhere.hidden = !slide || viewingLive;
  if (slide && !viewingLive) {
    const kind = tabOf(state.liveId) === 'bible' ? 'passage' : 'song';
    el.elsewhereText.textContent =
      `The TV is showing ${titleOf(state.liveId)}, ${slide.name}. ` +
      `Next keeps going through that ${kind}, then starts this one.`;
    el.goLiveSong.textContent = `Go to that ${kind}`;
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
  const count = slidesOf(state.liveId).length;
  return `The TV is showing ${titleOf(state.liveId)}, ${slide.name} (slide ${state.index + 1} of ${count}).`;
}

function liveSlide() {
  return slidesOf(state.liveId)?.[state.index] ?? null;
}

function slidesOf(id) {
  return songSlides.get(id) ?? passages.get(id)?.slides ?? null;
}

function tabOf(id) {
  return passages.has(id) ? 'bible' : 'songs';
}

// A song's title, or a passage's reference and translation: "John 3:16–18 (KJV)".
function titleOf(id) {
  const passage = passages.get(id);
  if (passage) return `${formatReference(passage.ref)} (${findTranslation(passage.translation).short})`;
  return songs.find((song) => song.id === id)?.title;
}

function scrollBehavior() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

// Saved state may name a song, passage or slide that no longer exists.
function checkState() {
  if (!liveSlide()) {
    state.liveId = null;
    state.index = -1;
    state.cleared = false;
  }
  if (!slidesOf(state.viewId)) state.viewId = state.liveId ?? songs[0]?.id ?? null;
  if (state.tab !== 'bible') state.tab = 'songs';
  state.black = state.black === true;
  saveState();
}

function loadState() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === 'object') {
      // Before the Bible tab, the item on the TV was called songId.
      if ('songId' in saved && !('liveId' in saved)) saved.liveId = saved.songId;
      delete saved.songId;
      return saved;
    }
  } catch {}
  return {};
}

function saveState() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}
