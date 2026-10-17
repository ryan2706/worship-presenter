# Worship Presenter

This file is the source of truth for the project. Update it whenever we make a decision, and record the decision in the Decisions log at the bottom.

## What it is

A free browser app for home cell groups. It projects song lyrics and Bible verses to a TV over HDMI. Think of it as a simple EasyWorship or ProPresenter.

## Who uses it

Volunteers who are not technical.

- Every screen must be obvious without instructions.
- Use big buttons and plain words. No jargon. For example, write "Next slide", not "Advance cue".
- It must work well on a phone and on a laptop.

## Tech rules

- It is a static site hosted on GitHub Pages.
- Plain HTML, CSS and JavaScript, using ES modules.
- No build step, no framework, no backend.
- Data is stored in the browser with IndexedDB. Users can export it to a JSON file and import it back.
- There are two windows:
  - **Control window**: where the volunteer picks songs and verses and moves through slides.
  - **Display window**: shown full screen on the TV.
  - The two windows talk to each other with `BroadcastChannel`.

### How the code is laid out

- `index.html`, `css/control.css`, `js/control.js`: the Control window.
- `display.html`, `css/display.css`, `js/display.js`: the Display (TV) window.
- `js/channel.js`: the shared channel name, the message list, and the keyboard shortcut rules.
- `js/fit-text.js`: auto-fits text to any screen, used by the TV and by the slide previews.
- `js/library.js`: the song library and the saved services. It is the only file that touches IndexedDB.
- `js/editor.js`: the song editor (add, edit, delete, restore) with its live preview.
- `js/lyrics.js`: turns the editor's lyrics box into a song's sections and back.
- `js/sample-songs.js`: the sample hymns that are added the first time the app runs.
- `js/backup-file.js`: makes and checks backup and shared-song files, and works out what a restore would change. No page code.
- `js/backup.js`: the Back up, Restore and Share buttons and screens, and the backup reminder.
- `js/bible-books.js`: the 66 books in order, with their short forms.
- `js/bible-reference.js`: reads typed references ("Ps 23", "1 Cor 13:4-7"), writes them neatly, and picks the verses out of a Bible file. No page code.
- `js/bibles.js`: the list of translations. The only place translations are named.
- `js/passage.js`: turns a passage's verses into slides. No page code.
- `js/bible-panel.js`: the Bible tab's form (reference, translation, two verses per slide).
- `js/service.js`: what a service is: making, changing, checking and comparing services. No page code.
- `js/service-panel.js`: the Service tab (the items, moving and removing them, and saving several services).
- `data/kjv.json`, `data/web.json`: the Bible text. See `data/README.md` for sources and licences.
- `tools/make-bible-data.py`: remakes the Bible files from eBible.org. Run by hand; it is not a build step.

To try it locally, run `python3 -m http.server 8000` in the project folder and open http://localhost:8000. ES modules don't load from `file://`.

### Tests

The browser checks for every phase live in `tests/presenter.spec.js` and use Playwright. The test tooling is only in `tests/`. The app itself still has no build step and no `package.json`.

- First time only: `npm install --prefix tests`.
- Run all checks: `npm test --prefix tests` (from the project folder).
- The tests start their own server on port 8123 (so they don't clash with port 8000) and use the installed Google Chrome. To use Playwright's own Chromium instead, run `(cd tests && npx playwright install chromium)` once, then `TEST_BROWSER=chromium npm test --prefix tests`.
- Add checks for each new feature to the spec, and run the whole suite before every commit.

### Messages between the windows

The channel name is `worship-presenter`.

- Control to Display:
  - `{type:'state', text, caption, black}` is always the full picture, so a Display that reloads catches up. `caption` is the Bible reference and translation shown small at the bottom of the TV, such as "John 3:16 · KJV". It is `''` for songs, and when the text is cleared.
  - `{type:'ping'}` asks whether a Display is open. It is sent when the Control page loads and after any Display closes.
- Display to Control:
  - `{type:'hello'}` is sent on load and in reply to `ping`.
  - `{type:'bye'}` is sent when the window closes.
  - `{type:'key', action}` passes on a shortcut pressed on the TV window: `next`, `previous` or `black`.

### Songs

- They are stored in the IndexedDB database `worship-presenter` (version 2), store `songs`, keyed by `id`. Version 2 added the `services` store; songs from version 1 are kept. If IndexedDB can't be opened, the built-in samples are shown instead, and saving shows a plain message.
- Songs are only ever saved in this browser, never to the repo or any server.
- A song is `{id, title, author?, year?, source?, sections: [{name, text}], order?, edited?}`. Each section is one slide. `order` lists section names in the order they're sung, so a chorus can repeat. Without it, the sections are used in the order listed. Songs the user adds get a random id.
- **Samples** are the songs whose id is in `js/sample-songs.js`. Each time the library loads, they are synced with that file:
  - a missing sample is added;
  - an unedited one is replaced with the file's version;
  - one marked `edited: true` is **never touched**;
  - a deleted one is kept as a marker `{id, deleted: true}`, so it stays away.

  A sample is marked `edited` only when its title or words differ from the original. **Restore original** puts back the file's version. **Bring back deleted sample songs** (under the song list, shown only when a sample was deleted) removes the markers.
- Each slide tile shows its section name, such as "Verse 1" or "Chorus".

### Song editor

- A title field and one lyrics box. A blank line starts a new slide. A label such as `[Verse 1]` or `[Chorus]` on its own line names the slide below it. A label with no words under it repeats the earlier slide with that name, which is stored as `order`. Slides with no label are called "Slide 1", "Slide 2" and so on.
- The live preview shows mini-TV tiles. Any slide over 6 lines gets a note saying it's long. If every slide is a single line (pasted with blank lines between lines), a notice offers **Join lines into verses**, which makes slides of up to 4 lines. A label always starts a new slide.
- The editor replaces the songs and slides while it's open. The bottom bar still runs the TV.
- Delete, Restore original, and Cancel with unsaved changes all ask first, in the page itself (no browser pop-ups).
- The note "Songs you add are saved on this device only. For songs still under copyright, your group needs a CCLI licence." is always shown.
- **Editing doesn't change the TV until Save.** When the song on the TV is saved, the TV gets the new words and stays on the same slide. It looks for that slide in this order: the same position with the same name, then the nearest slide with that name, then the same position, then the last slide. Black screen and Clear text stay as they were. Deleting the song on the TV clears the TV.
- Search (above the song list) matches titles and words. It ignores capitals, accents, punctuation and curly quotes.

### Backup, restore and sharing

Everything stays on this device unless the volunteer presses a button that saves a file.

- A file is `{app: 'Worship Presenter', kind: 'backup' | 'shared', version: 1, savedAt, songs: [...], services: [...]}`. `services` came later and is optional, so older files still work, and older versions of the app ignore it. A file with only services is allowed.
- **Back up my songs** saves `worship-songs-YYYY-MM-DD.json` (local date) with songs the user added, edited samples, `{id, deleted: true}` markers for deleted samples, and every service. Unedited samples are left out.
- **Share songs** lets the user tick songs and services and saves `shared-songs-YYYY-MM-DD.json` with only those. Ticking a service ticks its songs too, so another group can run the same meeting.
- **Restore from backup** opens either kind of file. Problems are explained in plain words (not a backup, damaged, made by a newer version, no songs). Songs that can't be read are skipped and counted.
- Before anything changes, a summary says "12 new songs, 3 songs you already have." A song is matched by id, then by title. Songs with the same title and words are left alone. For the rest, the user picks **Keep mine**, **Use the backup's** (or **Use the shared one**) or **Keep both**, one by one or for all of them. The default is Keep mine, except when the user's copy is an unedited sample, where it's the file's version. Keep both adds the file's copy titled "(from backup)" or "(shared)".
- A restore never deletes a song that isn't in the file. A deleted-sample marker only hides a sample that hasn't been edited here.
- **Services in a file** are matched by id. One you don't have is added. One that's the same as yours is left alone. A different one is added as a copy named "(from backup)" or "(shared)", and yours isn't changed. Songs in a restored service point to the song as it is on this device afterwards: a song matched by title points to yours, and with Keep both it points to the file's copy.
- The **Keep your songs safe** box (Back up, Restore, Share) sits under the song list. On phones it moves below the slides, so the slides come first.
- After any change to the songs, the app asks the browser to keep its storage (`navigator.storage.persist`).
- `localStorage` key `worship-presenter:backup` holds `changedAt` (first change since the last backup) and `dismissedAt`. A reminder shows when changes have gone 7 days without a backup, but only while no slide has been put on the TV in this session (so it never shows during worship). **Not now** hides it for 7 days. Songs that existed before this feature count as a change.

### Bible

- The left side has three big tabs, **Songs**, **Bible** and **Service**. A tab that isn't open shows "On the TV" when what's on the TV is in it. Keep your songs safe only shows with the Songs tab.
- **Translations:** KJV (1769) and WEB (World English Bible Updated, `engwebu`, with "the LORD"). Both are public domain, from eBible.org. Each Bible file (about 4 MB, 1.2 MB compressed) is only fetched the first time a passage in it is shown.
- **Adding a translation** means adding one line to `TRANSLATIONS` in `js/bibles.js`. A translation is `{id, short, name, notice, getVerses(ref)}`. `getVerses` returns `[{chapter, verse, text}]` or throws an Error with a plain message. The picker, captions and notice line are built from these fields. ESV will be a `proxyBible` in `js/bible-esv.js` that asks the Cloudflare Worker for verses and shows Crossway's notice.
- **Only references are saved** (`sessionStorage`), never the words, so a translation with storage limits fits.
- **References** are forgiving:
  - short forms ("Jn", "1 Cor", "Ps"), Roman numerals and "1st"/"First";
  - small spelling mistakes ("Jhon", "Mathew", "Phillipians");
  - "3 16" or "3.16" for 3:16, any dash, "to";
  - whole chapters, chapter ranges ("Ps 23-24"), verse ranges, and ranges across chapters;
  - in one-chapter books, "Jude 3" is verse 3.
  Lists ("3:16, 18") are not supported. Problems are explained in plain words, such as "John has 21 chapters." or "Did you mean Judges or Jude?"
- **Slides:**
  - One verse per slide, labelled "Verse 16".
  - **Two short verses per slide** (remembered in `localStorage` `worship-presenter:bible`, with the last translation) joins two verses of up to 110 characters each, up to 200 in total.
  - A verse over 200 characters is split into roughly equal parts of up to 200 characters, labelled "Verse 9 (part 2 of 3)". Breaks come at a sentence end, then `; :`, then a comma, then between words.
  - Changing the layout keeps the TV on the same verse.
  - Verses the translation leaves empty (5 in the WEB) are skipped.
- **A passage is an item like a song.** Next, Previous, Black screen, Clear text, reloads, "On the TV" marks and **Go to that passage** all behave the same.
  - The Bible tab lists this session's passages, newest first, up to 10. The passage on the TV always stays in the list.
  - After a reload, only the passage on the TV and the one being viewed are loaded straight away.
  - Showing a passage moves focus out of the reference box, so the arrow keys and Space move the slides again.

### Service order

- A **service** is the order of songs and passages for one meeting: `{id, name, date: 'YYYY-MM-DD', updatedAt, items}`. An item is a reference only, never the words: `{key, type: 'song', songId, title}` or `{key, type: 'passage', translation, ref}`. `key` tells apart two entries for the same song. `title` is only a label for when the song has been deleted.
- Services are stored in the IndexedDB store `services`, keyed by `id`. If they can't be saved, they last until the page closes and a plain message says so. Which service is open is kept in `localStorage` `worship-presenter:service`.
- The third tab, **Service**, shows the open service: its name and date, **Rename** (name and date), **Duplicate**, **Delete** (asks first, in the page), **+ New service**, and **Other services** (newest date first) to open another.
- **+ Add to service** (next to Edit song) adds the song or passage being viewed, from any tab. If there's no service yet, one called "Meeting" with today's date is made.
- Each item has **Up**, **Down** and **Remove**. On laptops, items can also be dragged by the ⠿ handle; dropping on an item takes its place. On phones and tablets (coarse pointer) there's no handle. Up and Down stay on laptops too, for keyboard users.
- A song that's been deleted is shown plainly ("This song isn't in your songs any more. It will be skipped."), can't be opened, and is skipped by Next. If the song comes back, the item works again. The same goes for a passage whose translation isn't available.
- **Running a service.** Next goes from the last slide of one item to the first slide of the next item in the open service. The item on the TV is marked "On the TV", the item Next will go to is marked "Next", and the bottom bar says "Next in the service: …" or "That's the end of the service."
  - Opening an item to look at it doesn't change the TV; Next keeps to the order, and clicking a slide shows it straight away.
  - If the Control page is showing the item on the TV, it follows the TV into the next item.
  - A song or passage opened from the Songs or Bible tab is played by Next after the current item (the old rule). Then Next carries on with the service from where it was.
  - Passages in the open service are loaded in the background, so Next doesn't wait.
- **Changing a service while it runs never changes the TV.** Moving items keeps the item on the TV where it is on the TV; Next follows the new order. Removing the item on the TV leaves the TV as it is (Black screen and Clear text too), and Next goes on to the item that came after it.
- The Control page's `sessionStorage` also keeps `liveEntry` (the service entry on the TV, or null), `viewEntry` (the one being viewed), and `serviceAt` (the entry Next carries on after, or `'start'` after the first item was removed).

### Behaviour rules

- **One key press, one action.** Arrows, PageUp/PageDown and B always act, except while typing in a text box (search, title, lyrics), where no key is a shortcut. Space and Enter only mean "next slide" when focus is not on a button, link or form field; otherwise the focused button handles them. After a mouse click on a slide, focus leaves it so that Space goes back to meaning "next".
- **Black screen and Clear text are different.** Black screen hides everything (and later, backgrounds too) and is a toggle. Clear text hides only the words and keeps the slide selected. Picking a slide brings the words back.
- **Auto-fit keeps lyric lines whole** when that is at least 70% of the size that wrapping would allow. The largest text is capped at one fifth of the screen height.
- **The Display holds a screen wake lock** while it is showing something, and asks again when the window becomes visible.
- **Looking at a song doesn't change the TV.** Picking a song shows its slides on the Control page only. Next and Space keep going through the song on the TV. Next on that song's last slide starts the first slide of the song being viewed (in a service, see Service order). Previous never leaves the song on the TV. Clicking any slide shows it straight away. When the TV is showing a different song from the one being viewed, the song list marks it "On the TV", and a note with a **Go to that song** button explains this.
- The Control page keeps the song on the TV, its slide, and the song being viewed in `sessionStorage`, so a reload carries on from the same place. Saved values that no longer match a song are dropped.

### Look

- Colours: evening `#1D2A3A` (page), dusk `#2B3B4F` (panels), mist `#C9D3DE` (secondary text), white (text), candle `#F2C14E` (marks the slide on the TV, and nothing else), ember `#E0674F` (used only while Black screen is on).
- Font: Atkinson Hyperlegible, loaded from Google Fonts. We'll self-host it when we add offline support.
- The TV is pure black with bold white centred text.

### Planned for later

- Phone remote using PeerJS, connected by scanning a QR code.
- Offline support as a PWA.
- ESV Bible text through a Cloudflare Worker proxy.

## Content rules

- Ship only public-domain hymns as samples. That means hymns published before 1929.
- Use the commonly sung wording rather than the author's earliest version, as long as every verse was published before 1929. Note where the wording differs in the song's `source` field.
- Ship only public-domain Bibles: KJV and WEB.
- Never put an API key in the site's code. Keys live only in the Cloudflare Worker.
- When we add ESV, follow Crossway's ESV API terms (including their limits on how much text is shown and stored, and the required copyright notice).

## Working rules

- Make small changes.
- After each change, explain what changed in plain English.
- Commit after each working feature.

## Decisions log

Add one line per decision, newest at the bottom, with the date.

- 2026-10-17: Project brief written and this CLAUDE.md created.
- 2026-10-17: First version: a Control page and a Display page with 3 test slides, Black screen, Clear text, auto-fit, Control-reload detection and wake lock. The file layout, messages and look are as described above.
- 2026-10-17: Atkinson Hyperlegible comes from Google Fonts for now. It must be self-hosted when we build the offline (PWA) version.
- 2026-10-17: Song library replaces the test slides. Songs live in IndexedDB, and 8 public-domain sample hymns are added on first run. Adding, editing and deleting songs comes next.
- 2026-10-17: Sample hymns: Amazing Grace, Be Thou My Vision, Blessed Assurance, Come Thou Fount, Holy Holy Holy, It Is Well with My Soul, Rock of Ages, What a Friend We Have in Jesus. Commonly sung wording, all verses pre-1929.
- 2026-10-17: Looking at a song doesn't change the TV. Next finishes the song on the TV, then starts the song being viewed.
- 2026-10-17: Phase 1 and 2 browser checks saved as a Playwright test suite in `tests/`. Run with `npm test --prefix tests`. It uses the installed Google Chrome, because downloading Playwright's Chromium timed out here.
- 2026-10-17: Song editor added: add, edit, delete and search songs, all saved only in this browser. One lyrics box with [Label] lines and blank lines between slides; a bare label repeats a section.
- 2026-10-17: Edited samples are marked `edited` and are never overwritten by sample updates in the repo. Unedited samples follow the repo. Deleted samples leave a marker so they stay deleted until "Bring back deleted sample songs" is pressed.
- 2026-10-17: Saving the song on the TV updates the TV and keeps the same slide where it still exists. No shortcuts fire while typing in a text box.
- 2026-10-17: The editor offers to join one-line slides into slides of up to 4 lines, and notes slides over 6 lines as long.
- 2026-10-17: Backup, restore and sharing added. One JSON file format (`kind` backup or shared, `version` 1) for both, restored with the same button. Restore shows a summary and asks about each song you already have; it never deletes songs not in the file. Storage persistence is requested after changes, and a dismissable reminder appears when changes go 7 days without a backup.
- 2026-10-17: On phones, Keep your songs safe moves below the slides. The backup reminder only shows while no slide has been put on the TV in this session.
- 2026-10-17: Bible text: KJV (1769) and WEB Updated (`engwebu`, "the LORD"), both public domain, converted once from eBible.org's USFM by `tools/make-bible-data.py` into `data/kjv.json` and `data/web.json`. USFM is used because it marks Psalm titles separately, so they never join verse 1. Footnotes, headings, Psalm titles and the Apocrypha are left out; verse words are kept exactly.
- 2026-10-17: Bible tab added. Passages are items like songs (same Next, Black screen, reload and "On the TV" rules). One verse per slide by default, with an option for two short verses. Verses over 200 characters are split across slides. The TV shows the reference and translation small at the bottom (`caption` in the state message). Translations are listed only in `js/bibles.js`, and only references are saved, so ESV can be added later as one more entry.
- 2026-10-17: Service order added: a third tab with saved services (name and date), built with Add to service, reordered by dragging or Up/Down, and run with Next from one item to the next. Services are stored in IndexedDB (database version 2, store `services`) as references only. A song opened from the Songs or Bible tab still plays next, then the service carries on. Moving or removing items while the service runs never changes the TV. Backups include every service, and Share can include services with their songs; restored services are relinked to the songs on this device, and a different service with the same id is added as a copy.
