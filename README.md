# worship-presenter

A free browser app for home cell groups. It shows song lyrics and Bible verses on a TV over HDMI, like a simple EasyWorship or ProPresenter.

Live at https://ryan2706.github.io/worship-presenter/

## Try it on your computer

```
python3 -m http.server 8000
```

Then open http://localhost:8000. (Opening `index.html` straight from the folder doesn't work.)

## Tests

```
npm install --prefix tests     # first time only
npm test --prefix tests
```

## Adding songs from chord charts

Songs from the GEAR chord charts are not part of this site, because most of them are under copyright. You turn them into one file and load that file into the app on each device.

The charts live in the GEAR project, next to this one:

```
GitHub/
  GEAR/charts/B/build-my-life.html   the charts
  GEAR/data/songs.json               their titles
  worship-presenter/                 this app
```

### To add a new song

1. **Write the chart in GEAR** as `charts/<first letter>/<name>.html`, for example `charts/B/build-my-life.html`. Use lowercase letters and hyphens in the name, with no capitals or Chinese characters.
2. **Add its title to GEAR's `data/songs.json`:**
   ```json
   { "title": "Build My Life", "url": "charts/B/build-my-life.html" }
   ```
   For a bilingual song, add `"titleZh": "..."` as well.
3. **Make the file.** In this folder, run:
   ```
   python3 tools/import-charts.py
   ```
   It writes `imported/imported-songs.json` and prints a report of anything it dropped or wasn't sure about. Read the report, and fix the chart if something looks wrong.
4. **Load it.** In the app, press **Restore from backup** and pick `imported/imported-songs.json`. Do this on each phone or laptop you use. Songs you already have are left alone, so only the new ones are added.

### How to write a chart

```html
<pre class="chord-chart" data-key="G">
[Verse 1]
G               C
Worthy of every song we could ever sing
G/B               C
Worthy of all the praise we could ever bring

[Chorus]
C              Am
Holy there is no one like you (x2)
</pre>
```

- `[Verse 1]`, `[Chorus]`, `[Pre-Chorus]`, `[Bridge]` and similar labels go on their own line. Capitals and spacing don't matter.
- Put chords on the line above the words, or inline like `[F]`. Only the words are shown.
- A blank line inside a section starts a new slide.
- Sections with only chords (Intro, Interlude, Instrumental) are left out.
- Notes for the band go in brackets, like `(x2)`, `(repeat)` or `(To Ending)`, and are left out. Words the group sings back, like "(Praise Him)", stay.
- `data-key` is kept with the song for later.

A **bilingual** chart puts each English line straight before its Chinese line:

```html
<pre class="chord-chart" data-format="bilingual" data-key="A" data-langs="en,zh-Hans">
[Verse 1]
en: A [A]thousand generations
zh: [A]世世代代前来
py: shì shì dài dài qián lái
</pre>
```

Pinyin (`py:`) lines are left out. Each bilingual chart becomes three songs: both languages, English only, and Chinese only.

Every imported song shows "<Song name> is the copyrighted property of its owner(s)." in small text at the bottom of the TV.
