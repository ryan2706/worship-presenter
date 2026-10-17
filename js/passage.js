// Turns the verses of a Bible passage into slides, like a song's sections.
// No page code here.
//
// One verse per slide, or two short verses together when asked. A verse too
// long to read comfortably is split across slides instead of getting tiny.

import { BOOKS, ONE_CHAPTER, bookName } from './bible-books.js';

// The most text on one slide. About five lines on the TV.
export const MAX_SLIDE_CHARS = 200;
// With "two short verses per slide", both verses must be at most this long.
export const SHORT_VERSE_CHARS = 110;

// slidesForPassage(verses, { ref, translation, twoPerSlide })
//   -> [{ name, text, caption, verses: ['3:16', ...], part }]
// `name` is the tile label, `caption` the small line at the bottom of the TV.
// `verses` and `part` say where the slide came from, so the same place can be
// found again when the layout changes.
export function slidesForPassage(verses, { ref, translation, twoPerSlide = false }) {
  const book = BOOKS[ref.book];
  const shown = verses.filter((verse) => verse.text);
  const spansChapters = shown.some((verse) => verse.chapter !== shown[0]?.chapter);

  // Short label for a verse in the tile ("16", or "3:36" when chapters change).
  const label = (verse) => (spansChapters ? `${verse.chapter}:${verse.verse}` : `${verse.verse}`);
  // The full reference for the caption ("John 3:16", "Jude 3", "Psalm 23:1").
  const where = (first, last) => {
    const name = bookName(book, true);
    const at = (verse) => (ONE_CHAPTER.has(book.name) ? `${verse.verse}` : `${verse.chapter}:${verse.verse}`);
    if (!last || last === first) return `${name} ${at(first)}`;
    return last.chapter === first.chapter && !ONE_CHAPTER.has(book.name)
      ? `${name} ${at(first)}–${last.verse}`
      : `${name} ${at(first)}–${at(last)}`;
  };
  const caption = (first, last) => `${where(first, last)} · ${translation.short}`;
  const key = (verse) => `${verse.chapter}:${verse.verse}`;

  const slides = [];
  for (let i = 0; i < shown.length; i += 1) {
    const verse = shown[i];
    const next = shown[i + 1];

    if (verse.text.length > MAX_SLIDE_CHARS) {
      const parts = splitText(verse.text, MAX_SLIDE_CHARS);
      parts.forEach((text, p) => {
        slides.push({
          name: `Verse ${label(verse)} (part ${p + 1} of ${parts.length})`,
          text,
          caption: caption(verse),
          verses: [key(verse)],
          part: p,
        });
      });
      continue;
    }

    const pair =
      twoPerSlide &&
      next &&
      verse.text.length <= SHORT_VERSE_CHARS &&
      next.text.length <= SHORT_VERSE_CHARS &&
      verse.text.length + next.text.length <= MAX_SLIDE_CHARS;
    if (pair) {
      slides.push({
        name: `Verses ${label(verse)}–${label(next)}`,
        text: `${verse.text}\n${next.text}`,
        caption: caption(verse, next),
        verses: [key(verse), key(next)],
        part: 0,
      });
      i += 1;
    } else {
      slides.push({ name: `Verse ${label(verse)}`, text: verse.text, caption: caption(verse), verses: [key(verse)], part: 0 });
    }
  }
  return slides;
}

// Where a slide went after the layout changed: the slide holding the same
// verse (and the same part of a long verse), or the nearest one.
export function sameVerseSlide(slides, before, index) {
  if (!before?.verses) return Math.min(index, slides.length - 1);
  const found = slides.findIndex((slide) => slide.verses.includes(before.verses[0]) && slide.part === before.part);
  if (found >= 0) return found;
  const anyPart = slides.findIndex((slide) => slide.verses.includes(before.verses[0]));
  return anyPart >= 0 ? anyPart : Math.min(index, slides.length - 1);
}

// Splits a long verse into about equal parts no longer than `max`, breaking at
// the end of a sentence if possible, then at ; or :, then at a comma, and
// only then between any two words.
export function splitText(text, max = MAX_SLIDE_CHARS) {
  const breaks = [/[.?!][’”)]*\s/g, /[;:—][’”)]*\s/g, /,[’”)]*\s/g, /\s/g];
  const parts = [];
  let rest = text.trim();

  while (rest.length > max) {
    const count = Math.ceil(rest.length / max);
    const ideal = rest.length / count;
    // The first part must leave little enough for the remaining parts.
    const shortest = Math.max(1, rest.length - max * (count - 1));
    let cut = -1;
    for (const pattern of breaks) {
      let best = -1;
      for (const match of rest.matchAll(pattern)) {
        const end = match.index + match[0].length;
        if (end < shortest || end > max) continue;
        if (best < 0 || Math.abs(end - ideal) < Math.abs(best - ideal)) best = end;
      }
      // Only use a weaker kind of break if the stronger kind is far from the middle.
      if (best >= 0 && Math.abs(best - ideal) <= ideal * 0.4) {
        cut = best;
        break;
      }
      if (best >= 0 && cut < 0) cut = best;
    }
    if (cut < 0) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  parts.push(rest);
  return parts;
}
