// The song editor: a title, one big box for the words, and a live preview.
// Nothing here changes the library or the TV until Save song is pressed;
// the callbacks passed to createEditor do that.

import { keepFitted } from './fit-text.js';
import { isEditedSample, slidesFor } from './library.js';
import { formatLyrics, joinSingleLines, looksLikeOneLinePerSlide, parseLyrics } from './lyrics.js';

const LONG_SLIDE_LINES = 6;
const PREVIEW_DELAY_MS = 150;
const CANT_SAVE = 'This browser isn’t letting us save songs (it may be a private window).';

export function createEditor({ onOpen, onClose, onSave, onDelete, onRestore }) {
  const el = {
    section: document.getElementById('editor'),
    heading: document.getElementById('editor-title'),
    form: document.getElementById('editor-form'),
    title: document.getElementById('editor-song-title'),
    titleError: document.getElementById('title-error'),
    lyrics: document.getElementById('editor-lyrics'),
    lyricsError: document.getElementById('lyrics-error'),
    joinNotice: document.getElementById('join-notice'),
    join: document.getElementById('join-lines'),
    count: document.getElementById('preview-count'),
    preview: document.getElementById('preview'),
    error: document.getElementById('editor-error'),
    actions: document.getElementById('editor-actions'),
    save: document.getElementById('editor-save'),
    cancel: document.getElementById('editor-cancel'),
    restore: document.getElementById('editor-restore'),
    delete: document.getElementById('editor-delete'),
    confirm: document.getElementById('editor-confirm'),
    confirmText: document.getElementById('confirm-text'),
    confirmYes: document.getElementById('confirm-yes'),
    confirmNo: document.getElementById('confirm-no'),
  };

  let song = null;
  let start = { title: '', lyrics: '' };
  let fitters = [];
  let timer = 0;
  let onConfirm = null;
  let confirmFrom = null;

  el.lyrics.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(renderPreview, PREVIEW_DELAY_MS);
    hideError(el.lyrics, el.lyricsError);
  });
  el.title.addEventListener('input', () => hideError(el.title, el.titleError));

  el.join.addEventListener('click', () => {
    el.lyrics.value = joinSingleLines(el.lyrics.value);
    renderPreview();
    el.lyrics.focus();
  });

  el.form.addEventListener('submit', (event) => {
    event.preventDefault();
    save();
  });

  el.cancel.addEventListener('click', () => {
    if (!isDirty()) return close();
    ask(el.cancel, 'Throw away your changes?', 'Throw away changes', 'Keep editing', close);
  });

  el.delete.addEventListener('click', () => {
    ask(el.delete, `Delete ‘${song.title}’? This can’t be undone.`, 'Yes, delete it', 'Keep it', () =>
      run(() => onDelete(song.id))
    );
  });

  el.restore.addEventListener('click', () => {
    ask(
      el.restore,
      'Put back the original words? Your changes to this song will be lost.',
      'Put back the original',
      'Keep my version',
      () => run(() => onRestore(song.id))
    );
  });

  el.confirmYes.addEventListener('click', () => {
    const action = onConfirm;
    hideConfirm();
    action?.();
  });
  el.confirmNo.addEventListener('click', () => {
    const from = confirmFrom;
    hideConfirm();
    from?.focus();
  });

  window.addEventListener('beforeunload', (event) => {
    if (isOpen() && isDirty()) event.preventDefault();
  });

  function open(existing = null) {
    song = existing;
    el.heading.textContent = song ? 'Edit song' : 'Add a song';
    el.title.value = song?.title ?? '';
    el.lyrics.value = song ? formatLyrics(song) : '';
    start = { title: el.title.value, lyrics: el.lyrics.value };
    el.delete.hidden = !song;
    el.restore.hidden = !isEditedSample(song);
    el.error.hidden = true;
    hideError(el.title, el.titleError);
    hideError(el.lyrics, el.lyricsError);
    hideConfirm();
    el.section.hidden = false;
    onOpen?.();
    renderPreview();
    el.section.scrollIntoView({ block: 'start' });
    el.title.focus({ preventScroll: true });
  }

  function close() {
    clearTimeout(timer);
    stopFitters();
    el.preview.replaceChildren();
    el.section.hidden = true;
    song = null;
    onClose?.();
  }

  function isOpen() {
    return !el.section.hidden;
  }

  function isDirty() {
    return el.title.value !== start.title || el.lyrics.value !== start.lyrics;
  }

  async function save() {
    const title = el.title.value.trim();
    const { sections, order } = parseLyrics(el.lyrics.value);
    if (!title) return showError(el.title, el.titleError, 'Give the song a title.');
    if (!sections.length) return showError(el.lyrics, el.lyricsError, 'Type the words of at least one slide.');

    const changed = song ? { ...song } : { id: newId() };
    delete changed.order;
    delete changed.edited;
    Object.assign(changed, { title, sections }, order ? { order } : {});
    await run(() => onSave(changed));
  }

  // Runs a library change. On success the editor closes; on failure it says so.
  async function run(change) {
    el.error.hidden = true;
    setBusy(true);
    try {
      await change();
      close();
    } catch (error) {
      console.warn('The song could not be saved.', error);
      el.error.textContent = CANT_SAVE;
      el.error.hidden = false;
    } finally {
      setBusy(false);
    }
  }

  function setBusy(busy) {
    [el.save, el.cancel, el.restore, el.delete].forEach((button) => (button.disabled = busy));
  }

  function renderPreview() {
    clearTimeout(timer);
    stopFitters();
    const slides = slidesFor(parseLyrics(el.lyrics.value));
    el.count.textContent = slides.length
      ? `${slides.length} ${slides.length === 1 ? 'slide' : 'slides'}`
      : 'Type the words above to see the slides.';
    el.joinNotice.hidden = !looksLikeOneLinePerSlide(el.lyrics.value);

    el.preview.replaceChildren(
      ...slides.map((slide, i) => {
        const item = document.createElement('li');
        item.className = 'preview-tile';
        item.innerHTML = `
          <span class="tile-screen"><span class="tile-text"></span></span>
          <span class="tile-caption">
            <span class="tile-number">${i + 1}</span>
            <span class="tile-label"></span>
          </span>
          <span class="long-note" hidden>
            This slide is long and the words will be small on the TV. Add a blank line to split it.
          </span>`;
        const text = item.querySelector('.tile-text');
        text.textContent = slide.text;
        item.querySelector('.tile-label').textContent = slide.name;
        const long = slide.text.split('\n').length > LONG_SLIDE_LINES;
        item.classList.toggle('is-long', long);
        item.querySelector('.long-note').hidden = !long;
        fitters.push(keepFitted(text, item.querySelector('.tile-screen'), { min: 4 }));
        return item;
      })
    );
  }

  function stopFitters() {
    fitters.forEach((fitter) => fitter.stop());
    fitters = [];
  }

  function ask(from, text, yes, no, action) {
    confirmFrom = from;
    onConfirm = action;
    el.confirmText.textContent = text;
    el.confirmYes.textContent = yes;
    el.confirmNo.textContent = no;
    el.actions.hidden = true;
    el.confirm.hidden = false;
    el.confirmNo.focus();
  }

  function hideConfirm() {
    onConfirm = null;
    confirmFrom = null;
    el.confirm.hidden = true;
    el.actions.hidden = false;
  }

  return { open, isOpen };
}

function showError(field, message, text) {
  message.textContent = text;
  message.hidden = false;
  field.setAttribute('aria-invalid', 'true');
  field.focus();
}

function hideError(field, message) {
  message.hidden = true;
  field.removeAttribute('aria-invalid');
}

function newId() {
  return crypto.randomUUID?.() ?? `song-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
