// Services: the order of songs and Bible passages for one meeting. No page
// code here; service-panel.js shows them and control.js runs them.
//
// A service is
//   { id, name, date: 'YYYY-MM-DD', updatedAt, items: [item, …] }
// An item is a reference only, never the words:
//   { key, type: 'song', songId, title }        title is only a label, for when the song has gone
//   { key, type: 'passage', translation, ref }
// `key` tells apart two entries for the same song, so a song can be sung twice.

import { BOOKS } from './bible-books.js';

export const DEFAULT_NAME = 'Meeting';

export function newId() {
  return crypto.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Today as 'YYYY-MM-DD', using the local date.
export function today(now = new Date()) {
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, '0')).join('-');
}

export function newService(name = DEFAULT_NAME, date = today()) {
  return { id: newId(), name, date, updatedAt: Date.now(), items: [] };
}

export function songItem(song) {
  return { key: newId(), type: 'song', songId: song.id, title: song.title };
}

export function passageItem(translation, ref) {
  return { key: newId(), type: 'passage', translation, ref: { ...ref } };
}

export function addItem(service, item) {
  return touched({ ...service, items: [...service.items, item] });
}

// Moves the item with this key to position `to`. The keys stay the same, so
// the item on the TV is still the item on the TV.
export function moveItem(service, key, to) {
  const items = [...service.items];
  const from = items.findIndex((item) => item.key === key);
  if (from < 0) return service;
  const [item] = items.splice(from, 1);
  items.splice(Math.max(0, Math.min(to, items.length)), 0, item);
  return touched({ ...service, items });
}

export function removeItem(service, key) {
  return touched({ ...service, items: service.items.filter((item) => item.key !== key) });
}

export function renameService(service, name, date) {
  return touched({ ...service, name, date });
}

export function duplicateService(service) {
  return {
    ...structuredClone(service),
    id: newId(),
    name: `${service.name} (copy)`,
    updatedAt: Date.now(),
    items: service.items.map((item) => ({ ...structuredClone(item), key: newId() })),
  };
}

// Newest date first, then by name.
export function sortServices(services) {
  return [...services].sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
}

export function songIdsIn(service) {
  return [...new Set(service.items.filter((item) => item.type === 'song').map((item) => item.songId))];
}

// "Fri 17 Oct". Read as a local date, so it never shifts by a day.
export function formatDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  const real = new Date(y, m - 1, d);
  return real.getFullYear() === y && real.getMonth() === m - 1 && real.getDate() === d;
}

// A Bible reference as saved: { book, startChapter, startVerse, endChapter, endVerse }.
export function validRef(ref) {
  const whole = (n) => Number.isInteger(n) && n > 0;
  return Boolean(
    ref &&
      Number.isInteger(ref.book) &&
      ref.book >= 0 &&
      ref.book < BOOKS.length &&
      whole(ref.startChapter) &&
      whole(ref.endChapter) &&
      (ref.startVerse === null || whole(ref.startVerse)) &&
      (ref.endVerse === null || whole(ref.endVerse))
  );
}

// Keeps only the fields a service has, and only if it looks like a real
// service. Items that can't be read are left out. Returns null if it can't be used.
export function cleanService(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!id || !name || !Array.isArray(raw.items)) return null;
  const keys = new Set();
  const items = raw.items.map(cleanItem).filter(Boolean);
  items.forEach((item) => {
    if (keys.has(item.key)) item.key = newId();
    keys.add(item.key);
  });
  return {
    id,
    name,
    date: validDate(raw.date) ? raw.date : today(),
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now(),
    items,
  };
}

function cleanItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const key = typeof raw.key === 'string' && raw.key.trim() ? raw.key.trim() : newId();
  if (raw.type === 'song') {
    const songId = typeof raw.songId === 'string' ? raw.songId.trim() : '';
    if (!songId) return null;
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    return { key, type: 'song', songId, title };
  }
  if (raw.type === 'passage') {
    const translation = typeof raw.translation === 'string' ? raw.translation.trim() : '';
    if (!translation || !validRef(raw.ref)) return null;
    const { book, startChapter, startVerse, endChapter, endVerse } = raw.ref;
    return { key, type: 'passage', translation, ref: { book, startChapter, startVerse, endChapter, endVerse } };
  }
  return null;
}

// True when two services have the same name, date and items in the same order.
export function sameService(a, b) {
  const shape = (service) =>
    JSON.stringify([
      service.name,
      service.date,
      service.items.map((item) =>
        item.type === 'song' ? ['song', item.songId] : ['passage', item.translation, item.ref]
      ),
    ]);
  return shape(a) === shape(b);
}

function touched(service) {
  return { ...service, updatedAt: Date.now() };
}
