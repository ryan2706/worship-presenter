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

### Planned for later

- Phone remote using PeerJS, connected by scanning a QR code.
- Offline support as a PWA.
- ESV Bible text through a Cloudflare Worker proxy.

## Content rules

- Ship only public-domain hymns as samples. That means hymns published before 1929.
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
