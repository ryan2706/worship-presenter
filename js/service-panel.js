// The Service tab: the open service's items (open, move, remove), and saving
// several services (new, rename, duplicate, delete, open another).
// Running the service (Next, the TV) is handled by control.js, which this
// talks to through the functions it's given, like bible-panel.js.

import { deleteService, listServices, saveService } from './library.js';
import {
  DEFAULT_NAME,
  addItem,
  duplicateService,
  formatDate,
  moveItem,
  newService,
  removeItem,
  renameService,
  sortServices,
  today,
  validDate,
} from './service.js';

// Which service is open, kept for next time (it's tonight's meeting).
const OPEN_KEY = 'worship-presenter:service';
const CANT_SAVE =
  'This browser isn’t letting us save services (it may be a private window). Your changes last until this page is closed.';

// resolve(item)  -> { label, detail, missing } where missing explains a song that's gone ('' if fine)
// marks()        -> { liveKey, nextKey, viewKey }
// onOpenItem(item)       an item was picked, to look at its slides
// onRemove(service, key) an item is about to be removed from the open service
// onChange()             the open service, or which one is open, changed
export function createServicePanel({ resolve, marks, onOpenItem, onRemove, onChange }) {
  const el = {
    head: document.getElementById('service-head'),
    name: document.getElementById('service-name'),
    date: document.getElementById('service-date'),
    actions: document.getElementById('service-actions'),
    rename: document.getElementById('service-rename'),
    duplicate: document.getElementById('service-duplicate'),
    remove: document.getElementById('service-delete'),
    form: document.getElementById('service-form'),
    formTitle: document.getElementById('service-form-title'),
    nameInput: document.getElementById('service-name-input'),
    dateInput: document.getElementById('service-date-input'),
    nameError: document.getElementById('service-name-error'),
    formCancel: document.getElementById('service-form-cancel'),
    confirm: document.getElementById('service-confirm'),
    confirmText: document.getElementById('service-confirm-text'),
    confirmYes: document.getElementById('service-confirm-yes'),
    confirmNo: document.getElementById('service-confirm-no'),
    items: document.getElementById('service-items'),
    empty: document.getElementById('service-empty'),
    error: document.getElementById('service-error'),
    add: document.getElementById('new-service'),
    othersTitle: document.getElementById('other-services-title'),
    others: document.getElementById('other-services'),
  };

  let services = [];
  let openId = null;
  // 'new' or 'rename' while the name and date form is open.
  let formMode = null;
  let dragKey = null;

  el.add.addEventListener('click', () => openForm('new'));
  el.rename.addEventListener('click', () => openForm('rename'));
  el.formCancel.addEventListener('click', closeForm);
  el.form.addEventListener('submit', (event) => {
    event.preventDefault();
    submitForm();
  });
  el.nameInput.addEventListener('input', () => setNameError(''));
  el.duplicate.addEventListener('click', () => {
    const service = current();
    if (!service) return;
    const copy = duplicateService(service);
    store(copy);
    open(copy.id);
  });
  el.remove.addEventListener('click', () => {
    const service = current();
    if (!service) return;
    closeForm();
    el.confirmText.textContent = `Delete ${service.name}? The songs stay in your song list.`;
    el.confirm.hidden = false;
    el.actions.hidden = true;
    el.confirmNo.focus();
  });
  el.confirmNo.addEventListener('click', () => {
    closeConfirm();
    el.remove.focus();
  });
  el.confirmYes.addEventListener('click', async () => {
    const service = current();
    closeConfirm();
    if (!service) return;
    services = services.filter((s) => s.id !== service.id);
    try {
      await deleteService(service.id);
    } catch (error) {
      console.warn('The service could not be deleted.', error);
      showError(CANT_SAVE);
    }
    open(sortServices(services)[0]?.id ?? null);
    el.add.focus();
  });

  async function load() {
    try {
      services = await listServices();
    } catch (error) {
      console.warn('Services could not be read.', error);
      services = [];
    }
    const saved = loadOpenId();
    openId = services.some((s) => s.id === saved) ? saved : sortServices(services)[0]?.id ?? null;
    render();
  }

  function current() {
    return services.find((s) => s.id === openId) ?? null;
  }

  function open(id) {
    openId = id;
    saveOpenId();
    closeForm();
    render();
    onChange();
  }

  // Adds an item to the open service, making one first if there isn't one.
  function add(item) {
    let service = current();
    if (!service) {
      service = newService();
      openId = service.id;
      saveOpenId();
    }
    service = addItem(service, item);
    store(service);
    render();
    onChange();
    return service;
  }

  // Keeps a changed service, in memory straight away and in the browser after.
  function store(service) {
    const i = services.findIndex((s) => s.id === service.id);
    if (i >= 0) services[i] = service;
    else services.push(service);
    saveService(service).catch((error) => {
      console.warn('The service could not be saved.', error);
      showError(CANT_SAVE);
    });
  }

  function change(service) {
    store(service);
    render();
    onChange();
  }

  function move(key, to, focusAction) {
    const service = current();
    if (!service) return;
    change(moveItem(service, key, to));
    if (focusAction) {
      const row = rowFor(key);
      const button = row?.querySelector(`[data-action="${focusAction}"]`);
      (button && !button.disabled ? button : row?.querySelector('.service-open'))?.focus();
    }
  }

  function remove(key) {
    const service = current();
    if (!service) return;
    const index = service.items.findIndex((item) => item.key === key);
    onRemove(service, key);
    change(removeItem(service, key));
    // Keep the keyboard in the list: on the row that took its place.
    const rows = el.items.querySelectorAll('.service-item');
    (rows[Math.min(index, rows.length - 1)]?.querySelector('[data-action="remove"]') ?? el.add).focus();
  }

  // Name and date

  function openForm(mode) {
    closeConfirm();
    formMode = mode;
    const service = current();
    const editing = mode === 'rename' && service;
    el.formTitle.textContent = editing ? 'Rename this service' : 'New service';
    el.nameInput.value = editing ? service.name : DEFAULT_NAME;
    el.dateInput.value = editing ? service.date : today();
    setNameError('');
    el.form.hidden = false;
    el.actions.hidden = true;
    el.nameInput.focus();
    el.nameInput.select();
  }

  function closeForm() {
    formMode = null;
    el.form.hidden = true;
    el.actions.hidden = !current();
  }

  function submitForm() {
    const name = el.nameInput.value.trim();
    if (!name) {
      setNameError('Give the service a name, such as “Friday meeting”.');
      el.nameInput.focus();
      return;
    }
    const date = validDate(el.dateInput.value) ? el.dateInput.value : today();
    const mode = formMode;
    if (mode === 'rename' && current()) {
      change(renameService(current(), name, date));
      closeForm();
      el.rename.focus();
    } else {
      const service = newService(name, date);
      store(service);
      open(service.id);
      el.add.focus();
    }
  }

  function setNameError(text) {
    el.nameError.textContent = text;
    el.nameError.hidden = !text;
    if (text) el.nameInput.setAttribute('aria-invalid', 'true');
    else el.nameInput.removeAttribute('aria-invalid');
  }

  function closeConfirm() {
    el.confirm.hidden = true;
    el.actions.hidden = !current() || !el.form.hidden;
  }

  function showError(text) {
    el.error.textContent = text;
    el.error.hidden = !text;
  }

  // The screen

  function render() {
    const service = current();
    el.head.hidden = !service;
    if (!el.form.hidden && formMode === 'rename' && !service) closeForm();
    el.actions.hidden = !service || !el.form.hidden || !el.confirm.hidden;
    if (service) {
      el.name.textContent = service.name;
      el.date.textContent = `${formatDate(service.date)} · ${plural(service.items.length, 'item')}`;
    }

    const { liveKey, nextKey, viewKey } = marks();
    const items = service?.items ?? [];
    el.items.replaceChildren(
      ...items.map((item, i) => {
        const { label, detail, missing } = resolve(item);
        const row = document.createElement('li');
        row.className = 'service-item';
        row.dataset.key = item.key;
        row.draggable = true;
        row.innerHTML = `
          <span class="service-grip" aria-hidden="true" title="Drag to move">⠿</span>
          <button class="service-open" type="button">
            <span class="service-number">${i + 1}</span>
            <span class="service-label"><span class="service-title"></span></span>
            <span class="service-mark"></span>
          </button>
          <p class="service-missing" hidden></p>
          <div class="service-buttons">
            <button class="btn btn-small" type="button" data-action="up">Up</button>
            <button class="btn btn-small" type="button" data-action="down">Down</button>
            <button class="btn btn-small" type="button" data-action="remove">Remove</button>
          </div>`;
        row.querySelector('.service-title').textContent = label;
        if (detail) {
          const small = document.createElement('span');
          small.className = 'song-detail';
          small.textContent = detail;
          row.querySelector('.service-label').append(' ', small);
        }
        const openButton = row.querySelector('.service-open');
        const mark = row.querySelector('.service-mark');
        if (item.key === liveKey) {
          mark.textContent = 'On the TV';
          row.classList.add('is-live');
        } else if (item.key === nextKey) {
          mark.textContent = 'Next';
          row.classList.add('is-next');
        }
        mark.hidden = !mark.textContent;
        if (item.key === viewKey) openButton.setAttribute('aria-current', 'true');
        if (missing) {
          row.classList.add('is-missing');
          openButton.disabled = true;
          const note = row.querySelector('.service-missing');
          note.textContent = missing;
          note.hidden = false;
        }
        openButton.addEventListener('click', (event) => {
          // After a mouse click, let Space and Enter go back to meaning "next slide".
          if (event.detail > 0) openButton.blur();
          onOpenItem(item);
        });

        const [up, down, removeButton] = row.querySelectorAll('[data-action]');
        up.disabled = i === 0;
        down.disabled = i === items.length - 1;
        up.setAttribute('aria-label', `Move ${label} up`);
        down.setAttribute('aria-label', `Move ${label} down`);
        removeButton.setAttribute('aria-label', `Remove ${label} from the service`);
        up.addEventListener('click', () => move(item.key, i - 1, 'up'));
        down.addEventListener('click', () => move(item.key, i + 1, 'down'));
        removeButton.addEventListener('click', () => remove(item.key));

        // Dragging, on laptops. Dropping on a row takes that row's place.
        row.addEventListener('dragstart', (event) => {
          dragKey = item.key;
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', item.key);
          row.classList.add('is-dragging');
        });
        row.addEventListener('dragend', () => {
          dragKey = null;
          el.items.querySelectorAll('.service-item').forEach((r) => r.classList.remove('is-dragging', 'is-drop'));
        });
        row.addEventListener('dragover', (event) => {
          if (!dragKey) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          el.items.querySelectorAll('.is-drop').forEach((r) => r !== row && r.classList.remove('is-drop'));
          if (dragKey !== item.key) row.classList.add('is-drop');
        });
        row.addEventListener('dragleave', () => row.classList.remove('is-drop'));
        row.addEventListener('drop', (event) => {
          event.preventDefault();
          const key = dragKey;
          dragKey = null;
          if (key && key !== item.key) move(key, i);
        });
        return row;
      })
    );

    el.empty.hidden = items.length > 0;
    el.empty.textContent = service
      ? 'This service is empty. Pick a song or a passage, then press Add to service.'
      : 'No service yet. Pick a song or a passage, then press Add to service. Or press New service.';

    const others = sortServices(services).filter((s) => s.id !== openId);
    el.othersTitle.hidden = !others.length;
    el.others.hidden = !others.length;
    el.others.replaceChildren(
      ...others.map((other) => {
        const li = document.createElement('li');
        li.innerHTML = `
          <button class="other-service" type="button">
            <span class="other-service-name"></span>
            <span class="song-detail"></span>
          </button>`;
        li.querySelector('.other-service-name').textContent = other.name;
        li.querySelector('.song-detail').textContent = `${formatDate(other.date)} · ${plural(other.items.length, 'item')}`;
        li.querySelector('button').addEventListener('click', () => {
          open(other.id);
          el.name.scrollIntoView({ block: 'nearest' });
        });
        return li;
      })
    );
  }

  function rowFor(key) {
    return [...el.items.querySelectorAll('.service-item')].find((row) => row.dataset.key === key) ?? null;
  }

  function saveOpenId() {
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify({ openId }));
    } catch {}
  }

  return {
    load,
    add,
    render,
    showError,
    get current() {
      return current();
    },
    get all() {
      return services;
    },
    // After a restore: read the services again, keeping the open one.
    reload: load,
  };
}

function loadOpenId() {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY))?.openId ?? null;
  } catch {
    return null;
  }
}

function plural(n, one, many = `${one}s`) {
  return `${n === 0 ? 'no' : n} ${n === 1 ? one : many}`;
}
