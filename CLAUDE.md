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
- `js/library.js`: the song library. It is the only file that touches IndexedDB.
- `js/sample-songs.js`: the sample hymns that are added the first time the app runs.

To try it locally, run `python3 -m http.server 8000` in the project folder and open http://localhost:8000. ES modules don't load from `file://`.

### Messages between the windows

The channel name is `worship-presenter`.

- Control to Display:
  - `{type:'state', text, black}` is always the full picture, so a Display that reloads catches up.
  - `{type:'ping'}` asks whether a Display is open. It is sent when the Control page loads and after any Display closes.
- Display to Control:
  - `{type:'hello'}` is sent on load and in reply to `ping`.
  - `{type:'bye'}` is sent when the window closes.
  - `{type:'key', action}` passes on a shortcut pressed on the TV window: `next`, `previous` or `black`.

### Songs

- They are stored in the IndexedDB database `worship-presenter`, store `songs`, keyed by `id`. The samples are added only when the database is first created. If IndexedDB can't be opened, the built-in samples are shown instead.
- A song is `{id, title, author, year, source?, sections: [{name, text}], order?}`. Each section is one slide. `order` lists section names in the order they're sung, so a chorus can repeat. Without it, the sections are used in the order listed.
- Each slide tile shows its section name, such as "Verse 1" or "Chorus".

### Behaviour rules

- **One key press, one action.** Arrows, PageUp/PageDown and B always act. Space and Enter only mean "next slide" when focus is not on a button, link or form field; otherwise the focused button handles them. After a mouse click on a slide, focus leaves it so that Space goes back to meaning "next".
- **Black screen and Clear text are different.** Black screen hides everything (and later, backgrounds too) and is a toggle. Clear text hides only the words and keeps the slide selected. Picking a slide brings the words back.
- **Auto-fit keeps lyric lines whole** when that is at least 70% of the size that wrapping would allow. The largest text is capped at one fifth of the screen height.
- **The Display holds a screen wake lock** while it is showing something, and asks again when the window becomes visible.
- **Looking at a song doesn't change the TV.** Picking a song shows its slides on the Control page only. Next and Space keep going through the song on the TV. Next on that song's last slide starts the first slide of the song being viewed. Previous never leaves the song on the TV. Clicking any slide shows it straight away. When the TV is showing a different song from the one being viewed, the song list marks it "On the TV", and a note with a **Go to that song** button explains this.
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
