// The Bible tab's form: type a reference, pick a translation, show the verses.
// The list of passages and the slides are handled by control.js, the same way
// as songs.

import { parseReference } from './bible-reference.js';
import { TRANSLATIONS, findTranslation } from './bibles.js';

// The last translation picked and the "two short verses" choice, kept for next time.
const PREFS_KEY = 'worship-presenter:bible';

export function createBiblePanel({ onShow, onLayoutChange }) {
  const el = {
    form: document.getElementById('bible-form'),
    reference: document.getElementById('bible-ref'),
    translations: document.getElementById('bible-translations'),
    two: document.getElementById('bible-two'),
    error: document.getElementById('bible-error'),
    show: document.getElementById('bible-show'),
  };

  const prefs = loadPrefs();
  let translationId = findTranslation(prefs.translation)?.id ?? TRANSLATIONS[0].id;
  el.two.checked = prefs.twoPerSlide === true;

  // One big button per translation, built from the list in bibles.js.
  const translationButtons = TRANSLATIONS.map((translation) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'translation';
    button.dataset.id = translation.id;
    button.innerHTML = '<span class="translation-short"></span> <span class="translation-name"></span>';
    button.querySelector('.translation-short').textContent = translation.short;
    button.querySelector('.translation-name').textContent = translation.name;
    button.addEventListener('click', () => {
      translationId = translation.id;
      savePrefs();
      renderTranslations();
      // Picking another translation shows the same passage in it straight away.
      if (el.reference.value.trim()) show();
    });
    el.translations.append(button);
    return button;
  });
  renderTranslations();

  el.form.addEventListener('submit', (event) => {
    event.preventDefault();
    show();
  });
  el.reference.addEventListener('input', () => setError(''));
  el.two.addEventListener('change', () => {
    savePrefs();
    onLayoutChange(el.two.checked);
  });

  async function show() {
    const parsed = parseReference(el.reference.value);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setError('');
    el.show.disabled = true;
    el.show.textContent = 'Loading…';
    try {
      await onShow({ translationId, ref: parsed.ref });
      // Done typing: put the phone keyboard away, and let the arrow keys and
      // Space go back to moving through the slides.
      if (document.activeElement === el.reference) el.reference.blur();
    } catch (error) {
      setError(error.message);
    } finally {
      el.show.disabled = false;
      el.show.textContent = 'Show verses';
    }
  }

  function setError(message) {
    el.error.textContent = message;
    el.error.hidden = !message;
    if (message) el.reference.setAttribute('aria-invalid', 'true');
    else el.reference.removeAttribute('aria-invalid');
  }

  function renderTranslations() {
    translationButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.id === translationId)));
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ translation: translationId, twoPerSlide: el.two.checked }));
    } catch {}
  }

  return {
    get twoPerSlide() {
      return el.two.checked;
    },
    showError: setError,
  };
}

function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY));
    if (saved && typeof saved === 'object') return saved;
  } catch {}
  return {};
}
