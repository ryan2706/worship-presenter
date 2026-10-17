// The 66 books of the Bible, in order. The Bible files in data/ use the same
// order, so BOOKS[i] is books[i] there.
//
// `aliases` (comma-separated) are other ways people write the book: short
// forms and other names, in lower case without dots. Numbered books put the
// number first, as in "1 cor". Spelling mistakes are handled in
// bible-reference.js, so they don't need listing here.

export const BOOKS = [
  ['Genesis', 'gen, ge, gn'],
  ['Exodus', 'exod, exo, ex'],
  ['Leviticus', 'lev, le, lv'],
  ['Numbers', 'num, nu, nm, nb'],
  ['Deuteronomy', 'deut, deu, dt'],
  ['Joshua', 'josh, jos, jsh'],
  ['Judges', 'judg, jdg, jg, jdgs'],
  ['Ruth', 'rut, rth, ru'],
  ['1 Samuel', '1 sam, 1 sa, 1 sm, 1 s'],
  ['2 Samuel', '2 sam, 2 sa, 2 sm, 2 s'],
  ['1 Kings', '1 kgs, 1 ki, 1 kin, 1 kg'],
  ['2 Kings', '2 kgs, 2 ki, 2 kin, 2 kg'],
  ['1 Chronicles', '1 chron, 1 chr, 1 ch'],
  ['2 Chronicles', '2 chron, 2 chr, 2 ch'],
  ['Ezra', 'ezr, ez'],
  ['Nehemiah', 'neh, ne'],
  ['Esther', 'esth, est, es'],
  ['Job', 'jb'],
  ['Psalms', 'psalm, ps, psa, pss, psm, pslm'],
  ['Proverbs', 'prov, pro, prv, pr'],
  ['Ecclesiastes', 'eccles, eccl, ecc, ec, qoheleth'],
  ['Song of Solomon', 'song of songs, song, songs, sos, so, canticles, cant, song of sol'],
  ['Isaiah', 'isa, is'],
  ['Jeremiah', 'jer, je, jr'],
  ['Lamentations', 'lam, la'],
  ['Ezekiel', 'ezek, eze, ezk'],
  ['Daniel', 'dan, da, dn'],
  ['Hosea', 'hos, ho'],
  ['Joel', 'jl, joe'],
  ['Amos', 'am, amo'],
  ['Obadiah', 'obad, ob, oba'],
  ['Jonah', 'jon, jnh'],
  ['Micah', 'mic, mc'],
  ['Nahum', 'nah, na'],
  ['Habakkuk', 'hab, hb'],
  ['Zephaniah', 'zeph, zep, zp'],
  ['Haggai', 'hag, hg'],
  ['Zechariah', 'zech, zec, zc'],
  ['Malachi', 'mal, ml'],
  ['Matthew', 'matt, mat, mt'],
  ['Mark', 'mrk, mar, mk, mr'],
  ['Luke', 'luk, lk'],
  ['John', 'jhn, joh, jn'],
  ['Acts', 'act, ac, acts of the apostles'],
  ['Romans', 'rom, ro, rm'],
  ['1 Corinthians', '1 cor, 1 co'],
  ['2 Corinthians', '2 cor, 2 co'],
  ['Galatians', 'gal, ga'],
  ['Ephesians', 'eph, ephes'],
  ['Philippians', 'phil, php, pp'],
  ['Colossians', 'col, co'],
  ['1 Thessalonians', '1 thess, 1 thes, 1 th'],
  ['2 Thessalonians', '2 thess, 2 thes, 2 th'],
  ['1 Timothy', '1 tim, 1 ti'],
  ['2 Timothy', '2 tim, 2 ti'],
  ['Titus', 'tit, ti'],
  ['Philemon', 'philem, phlm, phm'],
  ['Hebrews', 'heb'],
  ['James', 'jas, jm'],
  ['1 Peter', '1 pet, 1 pe, 1 pt, 1 p'],
  ['2 Peter', '2 pet, 2 pe, 2 pt, 2 p'],
  ['1 John', '1 jn, 1 jhn, 1 joh, 1 j'],
  ['2 John', '2 jn, 2 jhn, 2 joh, 2 j'],
  ['3 John', '3 jn, 3 jhn, 3 joh, 3 j'],
  ['Jude', 'jud, jd'],
  ['Revelation', 'rev, re, rv, revelations, apocalypse, revelation of john'],
].map(([name, aliases], index) => ({
  index,
  name,
  aliases: aliases.split(', '),
}));

// The books with only one chapter, where "Jude 3" means verse 3.
export const ONE_CHAPTER = new Set(['Obadiah', 'Philemon', '2 John', '3 John', 'Jude']);

// The book of Psalms is named "Psalm" for a single psalm: "Psalm 23", not "Psalms 23".
export function bookName(book, oneChapter) {
  return book.name === 'Psalms' && oneChapter ? 'Psalm' : book.name;
}
