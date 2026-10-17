// The song library, kept in the browser with IndexedDB.
// This is the only file that talks to IndexedDB.
//
// Database "worship-presenter", store "songs" (keyed by song id).
//
// A song whose id is in SAMPLE_SONGS is a sample. Every time the library is
// read, the samples are brought up to date with the ones in sample-songs.js:
//   missing                 added (first run, or a new sample in the repo)
//   { id, deleted: true }   the user deleted it, so it stays away
//   edited: true            the user changed the words, so it is never touched
//   anything else           replaced with the version in the repo

import { SAMPLE_SONGS } from './sample-songs.js';

const DB_NAME = 'worship-presenter';
const DB_VERSION = 1;
const SONGS = 'songs';

const SAMPLES = new Map(SAMPLE_SONGS.map((song) => [song.id, song]));

let dbPromise = null;

export function openLibrary() {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(SONGS, { keyPath: 'id' });
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
    const tx = db.transaction(SONGS, 'readwrite');
    const store = tx.objectStore(SONGS);
    const byId = new Map((await result(store.getAll())).map((record) => [record.id, record]));
    SAMPLE_SONGS.forEach((sample) => {
      const record = byId.get(sample.id);
      if (record && (record.deleted || record.edited || same(record, sample))) return;
      const fresh = structuredClone(sample);
      store.put(fresh);
      byId.set(sample.id, fresh);
    });
    await finished(tx);
    songs = [...byId.values()].filter((record) => !record.deleted);
  } catch (error) {
    console.warn('Using the built-in songs because the library could not be opened.', error);
    songs = SAMPLE_SONGS;
  }
  return [...songs].sort((a, b) => a.title.localeCompare(b.title));
}

// Saves a new or changed song. A sample is marked as edited only if its
// title or words differ from the original, so it can still get repo updates.
export async function saveSong(song) {
  const record = prepare(song);
  await write((store) => store.put(record));
  return record;
}

// Adds or replaces several songs at once, from a backup or a shared file.
// A "deleted" marker is only ever written for a sample, never over a song
// the user added.
export async function addSongs(records) {
  await write((store) => {
    records.forEach((record) => {
      if (record.deleted) {
        if (SAMPLES.has(record.id)) store.put({ id: record.id, deleted: true });
      } else {
        store.put(prepare(record));
      }
    });
  });
}

// Everything in the library, exactly as stored: songs and "deleted" markers.
export async function listRecords() {
  const db = await openLibrary();
  return result(db.transaction(SONGS).objectStore(SONGS).getAll());
}

// What a backup needs: songs the user added, edited samples, and markers for
// deleted samples. Unedited samples aren't needed; the app always has them.
export function needsBackup(record) {
  return !SAMPLES.has(record.id) || record.edited === true || record.deleted === true;
}

export function isSample(id) {
  return SAMPLES.has(id);
}

export function newSongId() {
  return crypto.randomUUID?.() ?? `song-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// User songs are removed. Samples leave a marker so they don't come back.
export async function deleteSong(id) {
  await write((store) => (SAMPLES.has(id) ? store.put({ id, deleted: true }) : store.delete(id)));
}

// Puts back the repo's version of a sample.
export async function restoreSample(id) {
  const sample = SAMPLES.get(id);
  if (!sample) throw new Error(`${id} is not a sample song.`);
  await write((store) => store.put(structuredClone(sample)));
}

export function isEditedSample(song) {
  return SAMPLES.has(song?.id) && song.edited === true;
}

export async function countDeletedSamples() {
  try {
    return (await deletedSampleIds()).length;
  } catch {
    return 0;
  }
}

// Removes the "deleted" markers, so the next listSongs() adds those samples back.
export async function restoreDeletedSamples() {
  const ids = await deletedSampleIds();
  await write((store) => ids.forEach((id) => store.delete(id)));
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

// True when two songs have the same title and the same slides in the same order.
export function sameWords(a, b) {
  return a.title === b.title && same(slidesFor(a), slidesFor(b));
}

// Helpers

function prepare(song) {
  const record = structuredClone(song);
  delete record.edited;
  const sample = SAMPLES.get(record.id);
  if (sample && !sameWords(record, sample)) record.edited = true;
  return record;
}

async function deletedSampleIds() {
  const db = await openLibrary();
  const records = await result(db.transaction(SONGS).objectStore(SONGS).getAll());
  return records.filter((record) => record.deleted && SAMPLES.has(record.id)).map((record) => record.id);
}

async function write(change) {
  const db = await openLibrary();
  const tx = db.transaction(SONGS, 'readwrite');
  change(tx.objectStore(SONGS));
  await finished(tx);
}

function result(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finished(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('The change was not saved.'));
  });
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
