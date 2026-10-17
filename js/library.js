// The song library, kept in the browser with IndexedDB.
// This is the only file that talks to IndexedDB.
//
// Database "worship-presenter", store "songs" (keyed by song id).
// The sample hymns are added once, when the database is first created.

import { SAMPLE_SONGS } from './sample-songs.js';

const DB_NAME = 'worship-presenter';
const DB_VERSION = 1;
const SONGS = 'songs';

let dbPromise = null;

export function openLibrary() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(SONGS, { keyPath: 'id' });
      SAMPLE_SONGS.forEach((song) => store.add(song));
    };
    request.onsuccess = () => {
      const db = request.result;
      // Let another tab upgrade or delete the library instead of being blocked.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('The song library is open in an older tab.'));
  });
  return dbPromise;
}

// All songs, sorted by title. If the browser won't store anything (for
// example some private windows), the built-in samples are used instead.
export async function listSongs() {
  let songs;
  try {
    const db = await openLibrary();
    songs = await new Promise((resolve, reject) => {
      const request = db.transaction(SONGS).objectStore(SONGS).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Using the built-in songs because the library could not be opened.', error);
    songs = SAMPLE_SONGS;
  }
  return [...songs].sort((a, b) => a.title.localeCompare(b.title));
}

// The song's slides, in the order they're sung: [{ name, text }].
export function slidesFor(song) {
  if (!song.order) return song.sections.map(({ name, text }) => ({ name, text }));
  const byName = new Map(song.sections.map((section) => [section.name, section]));
  return song.order
    .map((name) => byName.get(name))
    .filter(Boolean)
    .map(({ name, text }) => ({ name, text }));
}
