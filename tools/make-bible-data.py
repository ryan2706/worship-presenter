#!/usr/bin/env python3
"""Makes data/kjv.json and data/web.json from eBible.org's USFM files.

Run by hand when the Bible text needs refreshing (it isn't a build step; the
app loads the committed JSON files):

    python3 tools/make-bible-data.py

Both texts are public domain (see data/README.md). Only the file format
changes: footnotes, cross-references, headings, Psalm titles and the
Apocrypha are left out, and the verse words are kept exactly as published.

Each output file is
    {"id", "name", "source", "books": [[["verse 1", "verse 2", ...], ...chapters], ...66 books]}
with the books in the same order as BOOKS in js/bible-books.js.
"""

import io
import json
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

BIBLES = [
    {
        'id': 'kjv',
        'name': 'King James Version',
        'source': 'https://ebible.org/Scriptures/eng-kjv_usfm.zip',
    },
    {
        'id': 'web',
        'name': 'World English Bible',
        'source': 'https://ebible.org/Scriptures/engwebu_usfm.zip',
    },
]

# The 66 books, in the order of js/bible-books.js, by their USFM codes.
BOOK_CODES = (
    'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER '
    'LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL '
    'MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'
).split()

# Lines starting with these markers are not verse text: identification,
# titles, headings, Psalm titles (\d), speaker names, colophons and so on.
SKIP_LINES = re.compile(r'\\(id|ide|h|toc\d|mt\d?|ms\d?|mr|s\d?|sr|r|d|sp|cl|cp|pc|imt\d?|is\d?|ip|ili\d?|rem)\b')

# Footnotes and cross-references are removed with everything inside them.
NOTES = re.compile(r'\\(f|fe|x)\s.*?\\\1\*', re.S)
# Word-level attributes such as \w grace|strong="G5485"\w* keep only the word.
ATTRIBUTES = re.compile(r'\|[^\\]*?(?=\\\+?\w+\*)')
# Any remaining character marker. An opening marker (\add ) takes the one space
# after it; a closing marker (\add*) takes none, so the words keep their spacing.
CLOSING_MARKERS = re.compile(r'\\\+?[a-z]+\d*\*')
OPENING_MARKERS = re.compile(r'\\\+?[a-z]+\d*\s?')


def main():
    out = ROOT / 'data'
    out.mkdir(exist_ok=True)
    for bible in BIBLES:
        books = read_bible(download(bible['source']))
        data = {'id': bible['id'], 'name': bible['name'], 'source': bible['source'], 'books': books}
        check(bible['id'], books)
        path = out / f"{bible['id']}.json"
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        print(f'Wrote {path.relative_to(ROOT)} ({path.stat().st_size // 1024} KB)')


def download(url):
    print(f'Downloading {url}')
    # eBible.org turns away Python's default user agent.
    request = urllib.request.Request(url, headers={'User-Agent': 'worship-presenter-data/1.0'})
    with urllib.request.urlopen(request) as response:
        return zipfile.ZipFile(io.BytesIO(response.read()))


def read_bible(archive):
    files = {}
    for name in archive.namelist():
        match = re.match(r'\d+-([0-9A-Z]{3})', Path(name).name)
        if match and name.endswith('.usfm'):
            files[match.group(1)] = archive.read(name).decode('utf-8-sig')
    missing = [code for code in BOOK_CODES if code not in files]
    if missing:
        sys.exit(f'Missing books: {missing}')
    return [read_book(code, files[code]) for code in BOOK_CODES]


def read_book(code, usfm):
    # Keep only lines that can hold verse text, then read the text as one stream.
    kept = [line for line in usfm.splitlines() if not SKIP_LINES.match(line.strip())]
    text = NOTES.sub('', '\n'.join(kept))

    chapters = []
    verse = None
    for token in re.split(r'(\\c\s+\d+|\\v\s+\d+(?:-\d+)?)', text):
        if token.startswith('\\c'):
            chapters.append([])
            verse = None
        elif token.startswith('\\v'):
            numbers = [int(n) for n in token.split()[1].split('-')]
            if numbers[0] != len(chapters[-1]) + 1:
                sys.exit(f'{code} {len(chapters)}: verse {numbers[0]} is out of order')
            for _ in range(numbers[0], numbers[-1] + 1):
                chapters[-1].append('')
            verse = len(chapters[-1]) - 1
        elif verse is not None:
            chapters[-1][verse] += token
    return [[clean(v) for v in chapter] for chapter in chapters]


def clean(text):
    text = ATTRIBUTES.sub('', text)
    text = CLOSING_MARKERS.sub('', text)
    text = OPENING_MARKERS.sub('', text)
    # The KJV's old paragraph marks (¶) aren't words that are read out.
    text = text.replace('¶', ' ')
    text = re.sub(r'\s+', ' ', text).strip()
    # Markers that sat next to punctuation leave a stray space before it.
    text = re.sub(r' ([,.;:!?’”)])', r'\1', text)
    text = re.sub(r'([“‘(]) ', r'\1', text)
    return text


def check(bible_id, books):
    def verse(book, chapter, number):
        return books[BOOK_CODES.index(book)][chapter - 1][number - 1]

    chapters = sum(len(book) for book in books)
    verses = sum(len(chapter) for book in books for chapter in book)
    print(f'{bible_id}: {len(books)} books, {chapters} chapters, {verses} verses')
    assert len(books) == 66, len(books)
    assert chapters == 1189, chapters
    assert 31000 <= verses <= 31200, verses

    for book in books:
        for chapter in book:
            for v in chapter:
                assert '\\' not in v and '|' not in v and 'strong=' not in v, v

    title_words = ('Psalm of David', 'Psalm by David', 'chief Musician', 'Chief Musician', 'Nathan the prophet')
    expected = {
        'kjv': {
            ('JHN', 3, 16): 'For God so loved the world, that he gave his only begotten Son',
            ('PSA', 23, 1): 'The LORD is my shepherd; I shall not want.',
            ('PSA', 51, 1): 'Have mercy upon me, O God',
        },
        'web': {
            ('JHN', 3, 16): 'For God so loved the world, that he gave his only born Son',
            ('PSA', 23, 1): 'The LORD is my shepherd; I shall lack nothing.',
            ('PSA', 51, 1): 'Have mercy on me, God',
        },
    }[bible_id]
    for (book, chapter, number), start in expected.items():
        text = verse(book, chapter, number)
        print(f'  {book} {chapter}:{number}  {text}')
        assert text.startswith(start), text
        assert not any(word in text for word in title_words), text

    longest = verse('EST', 8, 9)
    print(f'  EST 8:9  {len(longest)} characters')
    assert len(longest) > 400


if __name__ == '__main__':
    main()
