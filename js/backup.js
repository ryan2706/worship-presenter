// Back up, restore and share songs, plus the gentle "make a backup" reminder.
// Files are only ever saved when the volunteer presses a button; nothing
// leaves this device otherwise.

import { FileProblem, countChanges, fileName, makeFile, planRestore, readFile, recordsFor } from './backup-file.js';
import { addSongs, listRecords, needsBackup, slidesFor } from './library.js';

// When songs last changed without a backup, and when the reminder was put away.
const REMINDER_KEY = 'worship-presenter:backup';
const REMIND_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const CANT_READ = 'This browser isn’t letting us read your songs (it may be a private window).';
const CANT_SAVE = 'This browser isn’t letting us save songs (it may be a private window). Nothing was changed.';

export function createBackup({ onOpen, onClose, getSongs, onImported, isTvInUse = () => false }) {
  const el = {
    backup: document.getElementById('backup'),
    restore: document.getElementById('restore'),
    share: document.getElementById('share'),
    file: document.getElementById('restore-file'),
    note: document.getElementById('file-note'),
    reminder: document.getElementById('reminder'),
    reminderBackup: document.getElementById('reminder-backup'),
    reminderLater: document.getElementById('reminder-later'),
    panel: document.getElementById('songs-file'),
    heading: document.getElementById('songs-file-title'),
    restoreView: document.getElementById('restore-view'),
    problem: document.getElementById('restore-problem'),
    problemButtons: document.getElementById('restore-problem-buttons'),
    tryAgain: document.getElementById('restore-try-again'),
    back: document.getElementById('restore-back'),
    plan: document.getElementById('restore-plan'),
    summary: document.getElementById('restore-summary'),
    added: document.getElementById('restore-added'),
    addedList: document.getElementById('restore-added-list'),
    existing: document.getElementById('restore-existing'),
    existingText: document.getElementById('restore-existing-text'),
    allChoices: document.getElementById('restore-all'),
    conflicts: document.getElementById('restore-conflicts'),
    extra: document.getElementById('restore-extra'),
    restoreError: document.getElementById('restore-error'),
    restoreGo: document.getElementById('restore-go'),
    restoreCancel: document.getElementById('restore-cancel'),
    shareView: document.getElementById('share-view'),
    shareList: document.getElementById('share-list'),
    shareAll: document.getElementById('share-all'),
    shareNone: document.getElementById('share-none'),
    shareGo: document.getElementById('share-go'),
    shareCancel: document.getElementById('share-cancel'),
  };

  let plan = null;
  let returnTo = null;

  el.backup.addEventListener('click', backUp);
  el.reminderBackup.addEventListener('click', backUp);
  el.reminderLater.addEventListener('click', () => {
    saveReminder({ ...loadReminder(), dismissedAt: Date.now() });
    el.reminder.hidden = true;
  });

  el.restore.addEventListener('click', chooseFile);
  el.tryAgain.addEventListener('click', chooseFile);
  el.file.addEventListener('change', () => {
    const file = el.file.files[0];
    el.file.value = '';
    if (file) openRestore(file);
  });
  el.back.addEventListener('click', close);
  el.restoreCancel.addEventListener('click', close);
  el.restoreGo.addEventListener('click', restore);
  el.allChoices.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-choice]')?.dataset.choice;
    if (!choice) return;
    plan.conflicts.forEach((conflict) => (conflict.choice = choice));
    renderChoices();
  });

  el.share.addEventListener('click', openShare);
  el.shareAll.addEventListener('click', () => tickAll(true));
  el.shareNone.addEventListener('click', () => tickAll(false));
  el.shareList.addEventListener('change', renderShareCount);
  el.shareGo.addEventListener('click', share);
  el.shareCancel.addEventListener('click', close);

  start();

  async function start() {
    // Someone who added songs before backups existed has changes to back up.
    const reminder = loadReminder();
    if (!reminder.changedAt && !reminder.backedUpAt) {
      try {
        if ((await listRecords()).some(needsBackup)) saveReminder({ ...reminder, changedAt: Date.now() });
      } catch {}
    }
    if (loadReminder().changedAt) askToKeepSongs();
    renderReminder();
  }

  // Called after any change to the songs.
  function noteChange() {
    const reminder = loadReminder();
    if (!reminder.changedAt) saveReminder({ ...reminder, changedAt: Date.now() });
    askToKeepSongs();
  }

  // Backup

  async function backUp() {
    let records;
    try {
      records = (await listRecords()).filter(needsBackup);
    } catch (error) {
      console.warn('The songs could not be read for a backup.', error);
      return showNote(CANT_READ);
    }
    const name = fileName('backup');
    saveFile(name, makeFile('backup', records));
    saveReminder({ backedUpAt: Date.now() });
    renderReminder();
    askToKeepSongs();
    const count = records.filter((record) => !record.deleted).length;
    showNote(
      `Backup saved as ${name}` +
        (count ? ` with ${plural(count, 'song')} you added or changed. ` : '. ') +
        'Keep it somewhere safe, such as your email or cloud storage.'
    );
  }

  // Restore

  function chooseFile() {
    el.file.click();
  }

  async function openRestore(file) {
    plan = null;
    el.heading.textContent = 'Restore from backup';
    el.shareView.hidden = true;
    el.restoreView.hidden = false;
    el.restoreError.hidden = true;
    try {
      const contents = readFile(await file.text(), file.size);
      plan = planRestore(contents, await listRecords());
    } catch (error) {
      if (!(error instanceof FileProblem)) console.warn('The file could not be restored.', error);
      showProblem(error instanceof FileProblem ? error.message : CANT_READ);
      return show();
    }
    el.problem.hidden = true;
    el.problemButtons.hidden = true;
    el.plan.hidden = false;
    renderPlan();
    show();
  }

  function showProblem(text) {
    el.problem.textContent = text;
    el.problem.hidden = false;
    el.problemButtons.hidden = false;
    el.plan.hidden = true;
  }

  function renderPlan() {
    const shared = plan.kind === 'shared';
    const have = plan.same.length + plan.conflicts.length;
    el.heading.textContent = shared ? 'Add shared songs' : 'Restore from backup';
    el.summary.textContent = capital(`${plural(plan.added.length, 'new song')}, ${plural(have, 'song')} you already have.`);

    el.added.hidden = !plan.added.length;
    el.addedList.replaceChildren(...plan.added.map((song) => listItem(song.title)));

    el.existing.hidden = !have;
    el.existingText.textContent = existingText();
    el.allChoices.hidden = plan.conflicts.length < 2;
    el.allChoices.querySelector('[data-choice="theirs"]').textContent = theirsLabel();
    el.conflicts.replaceChildren(
      ...plan.conflicts.map((conflict, i) => {
        const item = document.createElement('li');
        item.className = 'conflict';
        item.innerHTML = `
          <p class="conflict-title"></p>
          <p class="conflict-meta"></p>
          <div class="choices" role="group">
            <button class="btn btn-small" type="button" data-choice="mine">Keep mine</button>
            <button class="btn btn-small" type="button" data-choice="theirs"></button>
            <button class="btn btn-small" type="button" data-choice="both">Keep both</button>
          </div>`;
        item.querySelector('.conflict-title').textContent = conflict.incoming.title;
        item.querySelector('.conflict-meta').textContent = conflictMeta(conflict);
        const group = item.querySelector('.choices');
        group.setAttribute('aria-label', conflict.incoming.title);
        group.querySelector('[data-choice="theirs"]').textContent = theirsLabel();
        group.addEventListener('click', (event) => {
          const choice = event.target.closest('[data-choice]')?.dataset.choice;
          if (!choice) return;
          plan.conflicts[i].choice = choice;
          renderChoices();
        });
        return item;
      })
    );
    renderChoices();

    const extra = [];
    if (plan.hides.length) {
      extra.push(
        `${plural(plan.hides.length, 'sample song')} you had deleted will be hidden again: ` +
          `${plan.hides.map((hide) => hide.title).join(', ')}.`
      );
    }
    if (plan.skipped) {
      extra.push(`${plural(plan.skipped, 'song')} in the file couldn’t be read, so ${plan.skipped === 1 ? 'it' : 'they'} will be skipped.`);
    }
    el.extra.textContent = extra.join(' ');
    el.extra.hidden = !extra.length;
    el.restoreGo.textContent = shared ? 'Add songs' : 'Restore songs';
  }

  function existingText() {
    const { same, conflicts } = plan;
    if (!conflicts.length) {
      return same.length === 1
        ? 'It’s exactly the same as yours, so it will be left as it is.'
        : 'They’re exactly the same as yours, so they will be left as they are.';
    }
    const choose = conflicts.length === 1 ? 'choose which to keep:' : 'choose what to do with each one:';
    if (!same.length) {
      return (conflicts.length === 1 ? 'It’s different from yours, so ' : 'They’re different from yours, so ') + choose;
    }
    return (
      `${capital(plural(same.length, 'song is', 'songs are'))} exactly the same as yours and will be left alone. ` +
      `For the ${conflicts.length === 1 ? 'other one' : `other ${conflicts.length}`}, ${choose}`
    );
  }

  function conflictMeta({ incoming, existing, pristine }) {
    const theirs = plan.kind === 'shared' ? 'The shared one' : 'The backup’s';
    const yours = pristine
      ? `Yours is the sample that came with the app, with ${plural(slideCount(existing), 'slide')}.`
      : `Yours has ${plural(slideCount(existing), 'slide')}.`;
    return `${yours} ${theirs} has ${plural(slideCount(incoming), 'slide')}.`;
  }

  function theirsLabel() {
    return plan.kind === 'shared' ? 'Use the shared one' : 'Use the backup’s';
  }

  function renderChoices() {
    el.conflicts.querySelectorAll('.conflict').forEach((item, i) => {
      item.querySelectorAll('[data-choice]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.choice === plan.conflicts[i].choice));
      });
    });
  }

  async function restore() {
    el.restoreError.hidden = true;
    const changes = countChanges(plan);
    const records = recordsFor(plan);
    if (records.length) {
      setBusy([el.restoreGo, el.restoreCancel], true);
      try {
        await addSongs(records);
        noteChange();
        await onImported();
      } catch (error) {
        console.warn('The songs could not be restored.', error);
        el.restoreError.textContent = CANT_SAVE;
        el.restoreError.hidden = false;
        return;
      } finally {
        setBusy([el.restoreGo, el.restoreCancel], false);
      }
    }
    close();
    showNote(doneText(changes));
  }

  function doneText({ added, replaced, hidden }) {
    const parts = [];
    if (added) parts.push(`added ${plural(added, 'song')}`);
    if (replaced) parts.push(`replaced ${plural(replaced, 'song')}`);
    if (hidden) parts.push(`hid ${plural(hidden, 'deleted sample song')}`);
    if (!parts.length) return 'Nothing needed to change. You already have these songs.';
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
    return `Done. We ${list}.`;
  }

  // Share

  function openShare() {
    el.heading.textContent = 'Share songs';
    el.restoreView.hidden = true;
    el.shareView.hidden = false;
    el.shareList.replaceChildren(
      ...getSongs().map((song) => {
        const item = document.createElement('li');
        item.innerHTML = `
          <label class="share-song">
            <input type="checkbox">
            <span></span>
          </label>`;
        item.querySelector('input').value = song.id;
        item.querySelector('span').textContent = song.title;
        return item;
      })
    );
    renderShareCount();
    show();
  }

  function tickAll(ticked) {
    el.shareList.querySelectorAll('input').forEach((box) => (box.checked = ticked));
    renderShareCount();
  }

  function tickedIds() {
    return [...el.shareList.querySelectorAll('input:checked')].map((box) => box.value);
  }

  function renderShareCount() {
    const count = tickedIds().length;
    el.shareGo.disabled = count === 0;
    el.shareGo.textContent = count ? `Save ${plural(count, 'song')} to a file` : 'Tick the songs to share';
  }

  function share() {
    const ids = new Set(tickedIds());
    const songs = getSongs().filter((song) => ids.has(song.id));
    if (!songs.length) return;
    const name = fileName('shared');
    saveFile(name, makeFile('shared', songs));
    close();
    showNote(
      `Saved ${plural(songs.length, 'song')} as ${name}. Send this file to the other group. ` +
        'They add the songs by pressing Restore from backup.'
    );
  }

  // The screen

  function show() {
    if (el.panel.hidden) returnTo = document.activeElement;
    el.panel.hidden = false;
    onOpen?.();
    el.panel.scrollIntoView({ block: 'start' });
    el.heading.focus({ preventScroll: true });
  }

  function close() {
    el.panel.hidden = true;
    plan = null;
    el.conflicts.replaceChildren();
    el.shareList.replaceChildren();
    onClose?.();
    if (returnTo?.isConnected && !returnTo.closest('[hidden]')) returnTo.focus({ preventScroll: true });
    returnTo = null;
  }

  function showNote(text) {
    el.note.textContent = text;
    el.note.hidden = false;
  }

  // Only shown while nothing is on the TV, so it never gets in the way during worship.
  function renderReminder() {
    const { changedAt, dismissedAt } = loadReminder();
    const now = Date.now();
    el.reminder.hidden = !(
      !isTvInUse() &&
      changedAt &&
      now - changedAt >= REMIND_AFTER_MS &&
      (!dismissedAt || now - dismissedAt >= REMIND_AFTER_MS)
    );
  }

  return { noteChange, refreshReminder: renderReminder };
}

// Asks the browser to keep the songs even when the device is short of space.
// Some browsers decide for themselves; Firefox may ask the volunteer once.
function askToKeepSongs() {
  try {
    navigator.storage?.persisted?.().then((kept) => kept || navigator.storage.persist?.()).catch(() => {});
  } catch {}
}

function saveFile(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function loadReminder() {
  try {
    const saved = JSON.parse(localStorage.getItem(REMINDER_KEY));
    if (saved && typeof saved === 'object') return saved;
  } catch {}
  return {};
}

function saveReminder(value) {
  try {
    localStorage.setItem(REMINDER_KEY, JSON.stringify(value));
  } catch {}
}

function setBusy(buttons, busy) {
  buttons.forEach((button) => (button.disabled = busy));
}

function listItem(text) {
  const item = document.createElement('li');
  item.textContent = text;
  return item;
}

function slideCount(song) {
  return slidesFor(song).length;
}

function capital(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function plural(n, one, many = `${one}s`) {
  return `${n === 0 ? 'no' : n} ${n === 1 ? one : many}`;
}
