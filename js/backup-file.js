// Backup and shared-song files: making them, checking them, and working out
// what restoring one would change. Nothing here touches the page or the
// library; backup.js does that.
//
// A file looks like this:
//   {
//     app: 'Worship Presenter',
//     kind: 'backup' | 'shared',
//     version: 1,
//     savedAt: '2026-10-17T19:30:00.000Z',
//     songs: [ song, …, { id, deleted: true }, … ],
//     services: [ service, … ]
//   }
// A backup holds songs the user added, edited samples, markers for deleted
// samples, and every service. A shared file holds only the songs and services
// that were ticked. `services` came later; files without it still work, and
// older versions of the app just ignore it.

import { isSample, newSongId, sameWords } from './library.js';
import { cleanService, newId, sameService } from './service.js';

export const APP_NAME = 'Worship Presenter';
export const FORMAT_VERSION = 1;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

// Shown when a file can't be used. The message is written for the volunteer.
export class FileProblem extends Error {}

export function makeFile(kind, records, now = new Date(), services = []) {
  const file = {
    app: APP_NAME,
    kind,
    version: FORMAT_VERSION,
    savedAt: now.toISOString(),
    songs: records.map((record) => (record.deleted ? { id: record.id, deleted: true } : cleanSong(record))),
    services: services.map(cleanService).filter(Boolean),
  };
  return JSON.stringify(file, null, 2);
}

// "worship-songs-2026-10-17.json" or "shared-songs-2026-10-17.json", using the local date.
export function fileName(kind, now = new Date()) {
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((n) => String(n).padStart(2, '0'))
    .join('-');
  return `${kind === 'shared' ? 'shared-songs' : 'worship-songs'}-${date}.json`;
}

// Checks a file's text. Returns { kind, songs, markers, services, skipped,
// skippedServices }, or throws a
// FileProblem that explains what's wrong in plain words.
export function readFile(text, size = text.length) {
  if (size > MAX_FILE_BYTES) {
    throw new FileProblem('This file is too big to be a song backup. Pick the backup file you saved from Worship Presenter.');
  }
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    throw new FileProblem(
      'This file can’t be read. Pick a backup file saved from Worship Presenter. Its name ends in .json.'
    );
  }
  if (!file || typeof file !== 'object' || file.app !== APP_NAME) {
    throw new FileProblem('This file isn’t a Worship Presenter backup. Pick a file saved with Back up my songs or Share songs.');
  }
  if (!Number.isInteger(file.version) || file.version < 1) {
    throw new FileProblem('This backup file is damaged, so it can’t be used. Try another backup.');
  }
  if (file.version > FORMAT_VERSION) {
    throw new FileProblem(
      'This backup was made by a newer version of Worship Presenter. Reload this page to get the newest version, then try again.'
    );
  }
  if (!Array.isArray(file.songs)) {
    throw new FileProblem('This backup file is damaged, so it can’t be used. Try another backup.');
  }

  const songs = [];
  const markers = [];
  const seen = new Set();
  let skipped = 0;
  file.songs.forEach((raw) => {
    const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
    if (raw?.deleted === true && id) {
      if (!seen.has(id)) markers.push({ id, deleted: true });
      seen.add(id);
      return;
    }
    const song = cleanSong(raw);
    if (!song) return (skipped += 1);
    if (seen.has(song.id)) return;
    seen.add(song.id);
    songs.push(song);
  });

  const services = [];
  let skippedServices = 0;
  const serviceIds = new Set();
  (Array.isArray(file.services) ? file.services : []).forEach((raw) => {
    const service = cleanService(raw);
    if (!service) return (skippedServices += 1);
    if (serviceIds.has(service.id)) return;
    serviceIds.add(service.id);
    services.push(service);
  });

  if (!songs.length && !markers.length && !services.length) {
    throw new FileProblem(
      skipped ? 'None of the songs in this file could be read, so nothing can be restored.' : 'This file has no songs in it.'
    );
  }
  return { kind: file.kind === 'shared' ? 'shared' : 'backup', songs, markers, services, skipped, skippedServices };
}

// Works out what restoring a file would do, given everything in the library.
//   added      songs this device doesn't have
//   same       songs this device already has with the same title and words
//   conflicts  [{ incoming, existing, choice }] songs this device has, but different
//   hides      sample songs that were deleted when the backup was made
//   services   { added, same, copies } services in the file: new, the same as
//              yours, or different from yours (added as a copy, never replacing)
// A song is matched by its id first, then by its title.
export function planRestore(file, records, existingServices = []) {
  const live = records.filter((record) => !record.deleted);
  const byId = new Map(live.map((record) => [record.id, record]));
  const byTitle = new Map();
  live.forEach((record) => {
    const key = titleKey(record.title);
    if (!byTitle.has(key)) byTitle.set(key, record);
  });
  const matched = new Set();

  const plan = {
    kind: file.kind,
    added: [],
    same: [],
    conflicts: [],
    hides: [],
    skipped: file.skipped,
    // The id each song in the file has on this device, when it's not its own.
    matchedIds: new Map(),
    services: { added: [], same: [], copies: [] },
    skippedServices: file.skippedServices ?? 0,
  };
  file.songs.forEach((incoming) => {
    let existing = byId.get(incoming.id);
    if (!existing || matched.has(existing.id)) {
      const byName = byTitle.get(titleKey(incoming.title));
      existing = byName && !matched.has(byName.id) && !file.songs.some((s) => s.id === byName.id) ? byName : null;
    }
    if (!existing) return plan.added.push(incoming);
    matched.add(existing.id);
    plan.matchedIds.set(incoming.id, existing.id);
    if (sameWords(existing, incoming)) return plan.same.push(incoming);
    // If yours is just the sample as it came with the app, there's nothing of
    // yours to lose, so the file's version is suggested.
    const pristine = isSample(existing.id) && existing.edited !== true;
    // The id a second copy gets, worked out now so services can point to it.
    const copyId = incoming.id === existing.id ? newSongId() : incoming.id;
    plan.conflicts.push({ incoming, existing, pristine, copyId, choice: pristine ? 'theirs' : 'mine' });
  });

  const suffix = file.kind === 'shared' ? ' (shared)' : ' (from backup)';
  const servicesById = new Map(existingServices.map((service) => [service.id, service]));
  (file.services ?? []).forEach((incoming) => {
    const existing = servicesById.get(incoming.id);
    if (!existing) return plan.services.added.push(incoming);
    // Compared as it would be saved, pointing to the songs on this device.
    if (sameService(existing, relink(incoming, plan.matchedIds))) return plan.services.same.push(incoming);
    plan.services.copies.push({ ...incoming, id: newId(), name: incoming.name + suffix });
  });

  // A deleted sample is only hidden again if it hasn't been changed here.
  const stored = new Map(records.map((record) => [record.id, record]));
  file.markers.forEach(({ id }) => {
    const record = stored.get(id);
    if (isSample(id) && record && !record.deleted && record.edited !== true && !matched.has(id)) {
      plan.hides.push({ id, title: record.title });
    }
  });
  return plan;
}

// The records to write for a plan and the choices made. Never deletes a song
// that isn't in the file.
export function recordsFor(plan) {
  const suffix = plan.kind === 'shared' ? ' (shared)' : ' (from backup)';
  const records = [...plan.added];
  plan.conflicts.forEach((conflict) => {
    const { incoming, existing, choice } = conflict;
    if (choice === 'theirs') records.push({ ...incoming, id: existing.id });
    if (choice === 'both') records.push({ ...incoming, id: conflict.copyId, title: incoming.title + suffix });
  });
  plan.hides.forEach(({ id }) => records.push({ id, deleted: true }));
  return records;
}

// The services to write for a plan. Each song in them points to the song as
// it is on this device after the restore: a song matched by title points to
// yours, and with Keep both it points to the file's copy.
export function servicesFor(plan) {
  const ids = new Map(plan.matchedIds);
  plan.conflicts.forEach(({ incoming, copyId, choice }) => {
    if (choice === 'both') ids.set(incoming.id, copyId);
  });
  return [...plan.services.added, ...plan.services.copies].map((service) => relink(service, ids));
}

function relink(service, ids) {
  return {
    ...service,
    items: service.items.map((item) =>
      item.type === 'song' && ids.has(item.songId) ? { ...item, songId: ids.get(item.songId) } : item
    ),
  };
}

// What a plan did, in counts.
export function countChanges(plan) {
  const choices = plan.conflicts.map((conflict) => conflict.choice);
  return {
    added: plan.added.length + choices.filter((choice) => choice === 'both').length,
    replaced: choices.filter((choice) => choice === 'theirs').length,
    hidden: plan.hides.length,
    services: plan.services.added.length + plan.services.copies.length,
  };
}

// Helpers

// Keeps only the fields a song has, and only if it looks like a real song.
function cleanSong(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!id || !title || !Array.isArray(raw.sections)) return null;
  const sections = raw.sections
    .filter((section) => typeof section?.name === 'string' && typeof section?.text === 'string')
    .map(({ name, text }) => ({ name: name.trim(), text: text.trim() }))
    .filter((section) => section.name && section.text);
  if (!sections.length || sections.length !== raw.sections.length) return null;

  const song = { id, title };
  if (typeof raw.author === 'string' && raw.author.trim()) song.author = raw.author.trim();
  if (Number.isInteger(raw.year)) song.year = raw.year;
  if (typeof raw.source === 'string' && raw.source.trim()) song.source = raw.source.trim();
  if (typeof raw.key === 'string' && raw.key.trim() && raw.key.trim().length <= 8) song.key = raw.key.trim();
  if (raw.copyrighted === true) song.copyrighted = true;
  song.sections = sections;
  if (Array.isArray(raw.order)) {
    const names = new Set(sections.map((section) => section.name));
    const order = raw.order.filter((name) => typeof name === 'string' && names.has(name));
    if (order.length) song.order = order;
  }
  if (raw.edited === true) song.edited = true;
  return song;
}

function titleKey(title) {
  return String(title)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}
