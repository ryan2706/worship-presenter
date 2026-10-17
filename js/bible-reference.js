// Reads Bible references the way people type them, such as "John 3:16-18",
// "Ps 23", "1 Cor 13:4-7", "jn 3 16" or "Jhon 3:16", and writes them back out
// neatly. No page code here.
//
// A reference is { book, startChapter, startVerse, endChapter, endVerse }, where
// `book` is an index into BOOKS. For whole chapters both verses are null.

import { BOOKS, ONE_CHAPTER, bookName } from './bible-books.js';

const EXAMPLE = 'like John 3:16';

// Every way of writing each book, without spaces: "1cor", "songofsongs", ...
const NAMES = BOOKS.flatMap((book) => [
  { book, key: squash(book.name), alias: false },
  ...book.aliases.map((alias) => ({ book, key: squash(alias), alias: true })),
]);

// parseReference(text) -> { ok: true, ref } or { ok: false, message }
export function parseReference(text) {
  const tidy = tidyUp(text ?? '');
  if (!tidy) return problem(`Type a Bible reference, ${EXAMPLE}.`);

  const parts = tidy.match(/^((?:[123] ?)?[a-z][a-z ]*?) ?(\d[\d :\-,;]*)?$/);
  if (!parts) return problem(`That doesn’t look like a Bible reference. Try one ${EXAMPLE}.`);

  const found = findBook(parts[1]);
  if (!found.book) return problem(found.message);
  const book = found.book;
  const oneChapter = ONE_CHAPTER.has(book.name);

  const numbers = (parts[2] ?? '').trim();
  if (/[,;]/.test(numbers)) {
    return problem('Lists of verses aren’t supported yet. Show one range at a time, like John 3:16-18.');
  }
  if (!numbers) {
    if (oneChapter) return { ok: true, ref: makeRef(book, 1, null, 1, null) };
    return problem(`Which chapter of ${book.name}? For example, ${bookName(book, true)} 1.`);
  }

  const match = numbers.match(/^(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$/);
  if (!match) return problem(`That doesn’t look like a Bible reference. Try one ${EXAMPLE}.`);
  let [, a, b, c, d] = match.map((n) => (n === undefined ? null : Number(n)));

  let ref;
  if (b === null && d === null) {
    // "John 3" or "Ps 23-24": whole chapters. In one-chapter books, "Jude 3" is a verse.
    ref = oneChapter ? makeRef(book, 1, a, 1, c ?? a) : makeRef(book, a, null, c ?? a, null);
  } else if (b === null) {
    // "John 3-4:2": from the start of chapter 3.
    ref = makeRef(book, a, 1, c, d);
  } else if (c === null) {
    ref = makeRef(book, a, b, a, b);
  } else if (d === null) {
    ref = makeRef(book, a, b, a, c);
  } else {
    ref = makeRef(book, a, b, c, d);
  }

  if ([ref.startChapter, ref.startVerse, ref.endChapter, ref.endVerse].some((n) => n === 0)) {
    return problem('Chapters and verses start at 1.');
  }
  const end = ref.endChapter * 1000 + (ref.endVerse ?? 999);
  const start = ref.startChapter * 1000 + (ref.startVerse ?? 0);
  if (end < start) {
    return problem(`The second number should come after the first, ${EXAMPLE}-18.`);
  }
  return { ok: true, ref };
}

// "John 3:16–18", "Psalm 23", "Psalms 23–24", "John 3:16–4:2", "Jude 3".
export function formatReference(ref) {
  const book = BOOKS[ref.book];
  const sameChapter = ref.startChapter === ref.endChapter;
  const name = bookName(book, sameChapter);
  if (ONE_CHAPTER.has(book.name)) {
    if (ref.startVerse === null) return name;
    return ref.endVerse === ref.startVerse ? `${name} ${ref.startVerse}` : `${name} ${ref.startVerse}–${ref.endVerse}`;
  }
  if (ref.startVerse === null) {
    return sameChapter ? `${name} ${ref.startChapter}` : `${name} ${ref.startChapter}–${ref.endChapter}`;
  }
  const start = `${name} ${ref.startChapter}:${ref.startVerse}`;
  if (!sameChapter) return `${start}–${ref.endChapter}:${ref.endVerse}`;
  return ref.endVerse === ref.startVerse ? start : `${start}–${ref.endVerse}`;
}

// The verses of a reference, from one book of a Bible file (an array of
// chapters, each an array of verse texts). Throws an Error with a plain
// message when the chapter or verse isn't there.
export function versesIn(ref, chapters) {
  const book = BOOKS[ref.book];
  const name = bookName(book, true);
  const chapterCount = chapters.length;
  const oneChapter = ONE_CHAPTER.has(book.name);

  for (const chapter of [ref.startChapter, ref.endChapter]) {
    if (chapter > chapterCount) {
      throw new Error(`${book.name} has ${chapterCount === 1 ? 'only one chapter' : `${chapterCount} chapters`}.`);
    }
  }
  const checkVerse = (chapter, verse) => {
    const count = chapters[chapter - 1].length;
    if (verse !== null && verse > count) {
      throw new Error(oneChapter ? `${name} has ${count} verses.` : `${name} ${chapter} has ${count} verses.`);
    }
  };
  checkVerse(ref.startChapter, ref.startVerse);
  checkVerse(ref.endChapter, ref.endVerse);

  const verses = [];
  for (let chapter = ref.startChapter; chapter <= ref.endChapter; chapter += 1) {
    const texts = chapters[chapter - 1];
    const first = chapter === ref.startChapter && ref.startVerse !== null ? ref.startVerse : 1;
    const last = chapter === ref.endChapter && ref.endVerse !== null ? ref.endVerse : texts.length;
    for (let verse = first; verse <= last; verse += 1) {
      verses.push({ chapter, verse, text: texts[verse - 1] });
    }
  }
  return verses;
}

// Finding the book

function findBook(typed) {
  const key = squash(typed);
  const shown = typed.trim().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  const notFound = { message: `We couldn’t find a book called ‘${shown}’. Try one ${EXAMPLE}.` };

  // 1. Exactly a name or a short form: "john", "1cor", "ps".
  const exact = NAMES.find((name) => name.key === key);
  if (exact) return { book: exact.book };

  // 2. The start of just one book's name: "eph", "revel", "deuteron".
  //    Without a number, "corinthians" or "pet" could be either of two books.
  const starts = unique(
    NAMES.filter((name) => name.key.startsWith(key) || name.key.replace(/^[123]/, '').startsWith(key)).map((name) => name.book)
  );
  if (starts.length === 1 && key.length >= 2) return { book: starts[0] };
  if (starts.length > 1 && key.length >= 2) return { message: didYouMean(starts) };

  // 3. A spelling mistake: "jhon", "mathew", "phillipians", "genisis".
  if (key.replace(/^[123]/, '').length < 3) return notFound;
  // A full name beats a short form at the same distance, so "jhon" is John
  // (one letter swapped) rather than Jonah ("jon", one letter extra).
  const allowed = key.length <= 5 ? 1 : 2;
  let best = Infinity;
  let closest = [];
  NAMES.forEach((name) => {
    if (name.key.length < 3) return;
    const distance = editDistance(key, name.key);
    if (distance > allowed) return;
    const score = distance + (name.alias ? 0.5 : 0);
    if (score < best) {
      best = score;
      closest = [name.book];
    } else if (score === best) {
      closest.push(name.book);
    }
  });
  closest = unique(closest);
  if (!closest.length) return notFound;
  if (closest.length === 1) return { book: closest[0] };
  return { message: didYouMean(closest) };
}

function didYouMean(books) {
  const names = books.slice(0, 5).map((book) => book.name);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`;
  return `Did you mean ${list}?`;
}

// Damerau–Levenshtein distance: letters added, missed, changed or swapped.
function editDistance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

// Tidying what was typed

function tidyUp(text) {
  let tidy = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Every kind of dash, and "to" / "through", mean a range.
    .replace(/[‐-―−]/g, '-')
    .replace(/(\d)\s*(?:to|through|thru)\s*(\d)/g, '$1-$2')
    // "3.16" means 3:16; other dots ("Ps.", "1 Cor.") are just dropped.
    .replace(/(\d)\s*\.\s*(\d)/g, '$1:$2')
    .replace(/[.'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Book numbers written as words or Roman numerals: "First John", "II Cor", "1st Peter".
    .replace(/^(?:first|1st)\s*/, '1 ')
    .replace(/^(?:second|2nd)\s*/, '2 ')
    .replace(/^(?:third|3rd)\s*/, '3 ')
    .replace(/^iii\s(?=[a-z])/, '3 ')
    .replace(/^ii\s(?=[a-z])/, '2 ')
    .replace(/^i\s(?=[a-z])/, '1 ')
    // "jn3:16" and "1cor" have the letters and numbers run together.
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/^(\d)([a-z])/, '$1 $2');

  // Words that only say what the numbers are: "John chapter 3 verse 16", "v 4", "vv 4-7".
  // The book's own first word is left alone, so "1 Ch 16" stays 1 Chronicles.
  const number = tidy.match(/^[123] /)?.[0] ?? '';
  tidy = number + tidy.slice(number.length).replace(/\s(?:chapters?|chap|ch|verses?|vv?|vs)(?=\s*\d)/g, ' ');

  // Spaces around ":" and "-" don't matter, and "3 16" means 3:16.
  tidy = tidy.replace(/\s+/g, ' ').replace(/\s*([:\-,;])\s*/g, '$1');
  return tidy.replace(/(\d) (\d)/, '$1:$2').trim();
}

function squash(text) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function makeRef(book, startChapter, startVerse, endChapter, endVerse) {
  return { book: book.index, startChapter, startVerse, endChapter, endVerse };
}

function problem(message) {
  return { ok: false, message };
}

function unique(items) {
  return [...new Set(items)];
}
