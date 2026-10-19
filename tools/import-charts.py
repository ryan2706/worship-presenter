#!/usr/bin/env python3
"""Turns the chord charts in charts/ into one file of songs for Restore.

Run by hand (it isn't a build step):

    python3 tools/import-charts.py [charts] [--index ../GEAR/data/songs.json]
                                   [--out charts/imported-songs.json] [--show 5]

Then open the app, press Restore from backup, and pick the file it made. Most
of these songs are under copyright, so the charts and the file stay on this
device: both are in .gitignore and never go on GitHub or the live site.

Each chart is a <pre class="chord-chart" data-key="G"> holding either
  - chord lines above lyric lines, with [Verse 1] style labels, or
  - (data-format="bilingual") "en:", "zh:" and "py:" lines with chords inline,
    like "en: [D2]Falling down in [A]worship".
Only the words are kept. Chords, pinyin, musician notes and sections with no
words (Intro, Interlude and so on) are left out, and a report lists what was
dropped so it can be checked.

The file is a Worship Presenter "shared" file (see js/backup-file.js). Each song is
    {id: 'chart-<file name>', title, source, key, copyrighted: true, sections}
A bilingual chart makes three songs: both languages (that id and title), English
only ('-en', "<Title> · English") and Chinese only ('-zh', "<Chinese title> · <Title>").
The ids stay the same from run to run, so restoring a newer file finds the
songs already there instead of adding them twice.
"""

import argparse
import html
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INDEX = ROOT.parent / 'GEAR' / 'data' / 'songs.json'
SOURCE = 'Imported from chord charts'
LONG_SLIDE = 6           # the editor notes slides over this many lines
PAIRS_PER_SLIDE = 2      # bilingual: English + Chinese line, twice
LINES_PER_SLIDE = 4      # a bilingual song in one language

# A chord: root, quality, extensions, (b5) style alterations, slash bass.
CHORD = (
    r'[A-G](?:#|b)?'
    r'(?:maj|min|dim|aug|sus|add|m|M|\+|°|ø)?'
    r'(?:\d+|sus\d*|add\d*|maj\d*|dim\d*|aug|[#b]\d+|\([#b]?\d+\))*'
    r'(?:/[A-G](?:#|b)?)?'
)
CHORD_TOKEN = re.compile(rf'^(?:{CHORD}|N\.?C\.?|[|:.\-/%]+|\(?(?:x\s*\d+|\d+\s*x)\)?)$')
INLINE_CHORD = re.compile(rf'\[(?:{CHORD}|N\.?C\.?)\]')
LABEL = re.compile(r'^\s*\[([^\[\]]+)\]\s*(.*)$')
LANG = re.compile(r'^\s*(en|zh|py!?):\s?(.*)$')

# Words that make a (parenthesis) a note for the band rather than words to sing.
MUSICIAN = re.compile(
    r'\b(?:x\s*\d+|\d+\s*x|repeat|echo|transpose|semi-?tones?|ending|last time|same chords|'
    r'intro|coda|key|play|capo|instrumental|chorus|verse|bridge|first time|\d+(?:st|nd|rd|th) time)\b',
    re.IGNORECASE,
)

# Section words, in the spelling shown. Longest first so "Pre-Chorus" wins over "Chorus".
SECTION_WORDS = [
    'Pre-Chorus', 'High Praise', 'Build Up', 'Instrumental', 'Turnaround', 'Interlude',
    'Chorus', 'Bridge', 'Ending', 'Verse', 'Intro', 'Outro', 'Final', 'Coda', 'Echo', 'Tag', 'End',
]
SECTION_PATTERNS = [
    (re.compile(r'^' + r'[\s_-]*'.join(map(re.escape, re.split(r'[\s-]', word.lower()))) + r'(?![a-z])', re.I), word)
    for word in SECTION_WORDS
]
# Dashes in the words: "Ho - ly" or "Je ---- sus" split a word to show the tune,
# "Holy ---- Spirit" holds a note between words. Any dash with a space beside
# it, or two or more dashes. A plain hyphen ("broken-hearted") is left alone.
SEPARATOR = r"(?:\s+[-–—…][-–—…\s]*|[-–—…]+\s[-–—…\s]*|[-–—…]{2,}[-–—…\s]*)"
PIECE = r"[A-Za-z']+(?:-[A-Za-z']+)*"
DASHES = re.compile(rf"{PIECE}(?:{SEPARATOR}{PIECE})+")
WORD = re.compile(r"[a-z']+")
SMALL_WORDS = {'a', 'an', 'and', 'the', 'of', 'in', 'on', 'to', 'for', 'at', 'by', 'with', 'as', 'or'}


def title_case(words, first_small=False):
    out = []
    for i, word in enumerate(words):
        lower = word.lower()
        if lower in SMALL_WORDS and (i or first_small):
            out.append(lower)
        else:
            out.append(word[:1].upper() + word[1:].lower())
    return ' '.join(out)


def title_from_filename(stem):
    """'how-deep-the-father-s-love' -> "How Deep the Father's Love"."""
    stem = re.sub(r'(\d)-(\d{3})(?!\d)', r'\1,\2', stem)          # 10-000 -> 10,000
    stem = re.sub(r'-(s|t|ve|re|ll|d|m)(?=-|$)', r"'\1", stem)    # father-s -> father's
    return title_case(stem.split('-'))


def tidy_label(raw):
    """'VERSE 2' -> 'Verse 2', 'Verse1' -> 'Verse 1', 'Pre-chorus' -> 'Pre-Chorus'.
    Returns (label, known)."""
    text = re.sub(r'\s+', ' ', raw).strip()
    for pattern, word in SECTION_PATTERNS:
        match = pattern.match(text)
        if match:
            rest = text[match.end():].strip(' -_')
            if not rest:
                return word, True
            if re.fullmatch(r'\d+', rest):
                return f'{word} {int(rest)}', True
            return f'{word} {title_case(rest.split(), first_small=True)}', True
    return title_case(text.split()), False


def is_chord_line(line):
    tokens = line.split()
    return bool(tokens) and all(CHORD_TOKEN.match(token) for token in tokens)


class Song:
    """What is learned about one chart while reading it."""

    def __init__(self, path, rel):
        self.path = path
        self.rel = rel
        self.notes = []          # (note, where)
        self.kept_parens = []    # (text, where)
        self.dropped_sections = []
        self.unknown_labels = []
        self.unpaired = []
        self.unlabelled = False
        self.pinyin = 0
        self.joined = []      # 'Ho - ly' style words that were joined

    def note(self, text, where):
        self.notes.append((text.strip(), where))


def clean_lyric(text, song, where):
    """Takes chords and musician notes out of one line of words."""
    text = INLINE_CHORD.sub('', text)
    for marker in re.findall(r'\{[^}]*\}|\*\*.*?\*\*|\[[^\]]*\]', text):
        song.note(marker, where)
        text = text.replace(marker, ' ')

    def paren(match):
        inside = match.group(0)
        if MUSICIAN.search(inside):
            song.note(inside, where)
            return ' '
        song.kept_parens.append((inside, where))
        return inside

    text = re.sub(r'\([^()]*\)|（[^（）]*）', paren, text)
    return re.sub(r'\s{2,}', ' ', text).strip()


def read_chart(path):
    """Returns (attributes, body text). Raises ValueError with a reason."""
    try:
        text = path.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        raise ValueError('not UTF-8 text')
    except OSError as error:
        raise ValueError(error.strerror or str(error))
    text = re.sub(r'<!--.*?-->', '', text, flags=re.S)
    match = re.search(r'<pre\b([^>]*\bclass\s*=\s*"[^"]*\bchord-chart\b[^"]*"[^>]*)>', text, flags=re.S)
    if not match:
        raise ValueError('no <pre class="chord-chart"> in it')
    attrs = dict(re.findall(r'data-([\w-]+)\s*=\s*"([^"]*)"', match.group(1)))
    body = re.sub(r'</?pre\b[^>]*>', '', text[match.end():])
    return attrs, html.unescape(body)


def sections_of(body, song):
    """Splits the body into [(label, lines)], keeping blank lines as ''."""
    sections = []
    current = None
    for raw in body.replace('\r\n', '\n').replace('\r', '\n').split('\n'):
        line = raw.rstrip()
        label = LABEL.match(line)
        if label and not INLINE_CHORD.fullmatch(f'[{label.group(1).strip()}]'):
            inner, after = label.group(1), label.group(2).strip()
            for paren in re.findall(r'\([^()]*\)', inner):
                song.note(paren, f'label [{inner.strip()}]')
                inner = inner.replace(paren, ' ')
            name, known = tidy_label(inner)
            if not known:
                song.unknown_labels.append(inner.strip())
            if after:
                song.note(after, f'after [{name}]')
            current = (name, [])
            sections.append(current)
            continue
        if current is None:
            if not line.strip():
                continue
            current = (None, [])
            sections.append(current)
        current[1].append(line)
    return sections


def english_slides(name, lines, song):
    """Blank lines split a section into slides with the same label."""
    slides, block = [], []
    for line in lines + ['']:
        where = name or 'no label'
        if not line.strip():
            if block:
                slides.append(block)
            block = []
            continue
        lang = LANG.match(line)
        if lang:
            if lang.group(1).startswith('py'):
                song.pinyin += 1
                continue
            line = lang.group(2)
        stripped = line.strip()
        if stripped.startswith('#'):
            continue
        if is_chord_line(stripped):
            continue
        words = clean_lyric(stripped, song, where)
        if words:
            block.append(words)
    return slides


def bilingual_pairs(name, lines, song):
    """Pairs each English line with its Chinese line: [{'en': …, 'zh': …}]."""
    pairs = []
    pair = None
    for line in lines:
        where = name or 'no label'
        if not line.strip():
            pair = None
            continue
        lang = LANG.match(line)
        if not lang:
            stripped = line.strip()
            if stripped.startswith('#') or is_chord_line(stripped):
                continue
            words = clean_lyric(stripped, song, where)
            if words:
                pairs.append({'en': words})
            pair = None
            continue
        code, text = lang.group(1), lang.group(2)
        if code.startswith('py'):
            song.pinyin += 1
            continue
        words = clean_lyric(text, song, where)
        if not words:
            continue
        if code == 'zh' and pair and 'zh' in pair:
            # A second Chinese line finishes the phrase held over the chords.
            pair['zh'] += words
            continue
        if code == 'en' or pair is None:
            pair = {}
            pairs.append(pair)
        pair[code] = words
    for item in pairs:
        if len(item) == 1:
            song.unpaired.append((next(iter(item.values())), name or 'no label'))
    return pairs


def chunks(items, size):
    return [items[i:i + size] for i in range(0, len(items), size)]


def bilingual_versions(pairs):
    """Slides for each version of a bilingual section:
       both  English line then Chinese line, two pairs to a slide
       en    English only, four lines to a slide
       zh    Chinese only, four lines to a slide
    A line with no partner is used in both one-language versions, since that's
    how it's sung."""
    return {
        'both': [[p[k] for p in group for k in ('en', 'zh') if k in p] for group in chunks(pairs, PAIRS_PER_SLIDE)],
        'en': chunks([p.get('en', p.get('zh')) for p in pairs], LINES_PER_SLIDE),
        'zh': chunks([p.get('zh', p.get('en')) for p in pairs], LINES_PER_SLIDE),
    }


def convert(path, rel, index):
    song = Song(path, rel)
    attrs, body = read_chart(path)
    bilingual = attrs.get('format') == 'bilingual' and re.search(r'^\s*zh:', body, flags=re.M)
    entry = index.get(f'charts/{rel}')
    song.title = (entry or {}).get('title') or title_from_filename(path.stem)
    song.title_zh = (entry or {}).get('titleZh', '').strip()
    song.key = attrs.get('key', '').strip()

    versions = {'both': [], 'en': [], 'zh': []} if bilingual else {'both': []}
    sections = sections_of(body, song)
    song.unlabelled = not any(name for name, _ in sections)
    for name, lines in sections:
        if bilingual:
            made = bilingual_versions(bilingual_pairs(name, lines, song))
        else:
            made = {'both': english_slides(name, lines, song)}
        if not made['both']:
            if name:
                song.dropped_sections.append(name)
            continue
        for version, blocks in made.items():
            slides = versions[version]
            for block in blocks:
                slides.append({'name': name or f'Slide {len(slides) + 1}', 'text': '\n'.join(block)})
    song.versions = versions
    song.slides = versions['both']
    song.bilingual = bool(bilingual)
    return song


class Words:
    """How often each word and each pair of words is sung, across all the charts."""

    def __init__(self, songs):
        self.words, self.pairs = Counter(), Counter()
        for song in songs:
            for slide in song.slides:
                for line in slide['text'].split('\n'):
                    for part in re.split(r'[-–—]+', line.lower()):
                        found = WORD.findall(part)
                        self.words.update(found)
                        self.pairs.update(zip(found, found[1:]))

    def tidy(self, line, song):
        """Joins a split word ("Je ---- sus", "Ho - san - na"), or turns a held
        note between two words into a space ("Holy ---- Spirit" -> "Holy Spirit").
        A word is joined when it's sung more often than the two pieces side by side."""

        def chain(match):
            parts = re.split(f'({SEPARATOR})', match.group(0))
            pieces, gaps = parts[0::2], parts[1::2]
            out, i = pieces[0], 0
            while i < len(gaps):
                for j in range(len(pieces) - 1, i, -1):
                    whole = ''.join(pieces[i:j + 1]).replace('-', '')
                    count = self.words[whole.lower()]
                    if count and count >= self.pairs[(pieces[i].lower(), pieces[i + 1].lower())]:
                        song.joined.append(''.join(p + g for p, g in zip(pieces[i:j], gaps[i:j])) + pieces[j])
                        out = out[:len(out) - len(pieces[i])] + whole
                        i = j
                        break
                else:
                    gap = gaps[i].strip()
                    if gaps[i][-1] in '-–—' and gaps[i][0].isspace():
                        # "Glo …… -ria": a dash stuck to the next piece carries on the word.
                        song.joined.append(pieces[i] + gaps[i] + pieces[i + 1])
                        out += pieces[i + 1]
                        i += 1
                        continue
                    # A single spaced dash between words is punctuation; holds become a space.
                    out += gaps[i] if gap in '-–—' and gaps[i] != gap else ' '
                    out += pieces[i + 1]
                    i += 1
            return out

        line = DASHES.sub(chain, line)
        return re.sub(r'\s*[-–—]{2,}\s*', ' ', line).strip()


def records(song):
    """The songs made from one chart. A bilingual chart makes three:
    both languages (the plain title and id), English only, and Chinese only."""
    zh_title = f'{song.title_zh} · {song.title}' if song.title_zh else f'{song.title} · 中文'
    made = [
        ('', song.title, 'both'),
        ('-en', f'{song.title} · English', 'en'),
        ('-zh', zh_title, 'zh'),
    ]
    out = []
    for suffix, title, version in made:
        if version not in song.versions:
            continue
        data = {'id': f'chart-{song.path.stem}{suffix}', 'title': title, 'source': SOURCE}
        if song.key:
            data['key'] = song.key
        data['copyrighted'] = True
        data['sections'] = song.versions[version]
        out.append(data)
    return out


def editor_text(slides):
    """The words as the song editor shows them (formatLyrics in js/lyrics.js)."""
    return '\n\n'.join(
        slide['text'] if slide['name'] == f'Slide {i + 1}' else f"[{slide['name']}]\n{slide['text']}"
        for i, slide in enumerate(slides)
    )


def title_key(title):
    text = unicodedata.normalize('NFD', title)
    text = ''.join(ch for ch in text if not unicodedata.combining(ch)).lower()
    return ''.join(ch for ch in text if ch.isalnum())


def sample_titles():
    path = ROOT / 'js' / 'sample-songs.js'
    try:
        return re.findall(r"^\s*title:\s*'((?:[^'\\]|\\.)*)'", path.read_text(encoding='utf-8'), flags=re.M)
    except OSError:
        return []


def load_index(path):
    if not path:
        return {}
    try:
        entries = json.loads(Path(path).read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        print(f'Could not read the index {path}: {error}. Titles come from file names.', file=sys.stderr)
        return {}
    return {entry['url']: entry for entry in entries if isinstance(entry, dict) and entry.get('url')}


def heading(text):
    print(f'\n{text}\n{"-" * len(text)}')


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('charts', nargs='?', default=str(ROOT / 'charts'))
    parser.add_argument('--index', default=str(DEFAULT_INDEX) if DEFAULT_INDEX.exists() else '')
    parser.add_argument('--out', default=None, help='default: <charts>/imported-songs.json')
    parser.add_argument('--show', type=int, default=5, help='songs to print as the editor shows them')
    args = parser.parse_args()

    charts = Path(args.charts).resolve()
    out = Path(args.out) if args.out else charts / 'imported-songs.json'
    index = load_index(args.index)

    songs, unreadable, empty = [], [], []
    for path in sorted(charts.rglob('*.html')):
        rel = path.relative_to(charts).as_posix()
        try:
            song = convert(path, rel, index)
        except ValueError as error:
            unreadable.append((rel, str(error)))
            continue
        (songs if song.slides else empty).append(song)

    words = Words(songs)
    for song in songs:
        for version, slides in song.versions.items():
            for slide in slides:
                # Joined words are listed once, from the version with both languages.
                log = song if version == 'both' else Song(song.path, song.rel)
                slide['text'] = '\n'.join(words.tidy(line, log) for line in slide['text'].split('\n'))

    ids = Counter(f'chart-{song.path.stem}' for song in songs)
    for song in songs:
        if ids[f'chart-{song.path.stem}'] > 1:
            song.path = song.path.with_name(song.path.parent.name.lower() + '-' + song.path.name)

    file = {
        'app': 'Worship Presenter',
        'kind': 'shared',
        'version': 1,
        'savedAt': datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
        'songs': [data for song in songs for data in records(song)],
        'services': [],
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(file, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    # The report.
    heading('Songs')
    bilingual = sum(s.bilingual for s in songs)
    print(f'{len(songs)} charts converted ({bilingual} bilingual) into {len(file["songs"])} songs, '
          f'saved to {out}')
    print(f'Each bilingual chart makes 3 songs: both languages, English only, and Chinese only.')
    print(f'Titles: {sum(1 for s in songs if f"charts/{s.rel}" in index)} from the index, '
          f'{sum(1 for s in songs if f"charts/{s.rel}" not in index)} from file names.')
    print(f'Pinyin lines left out: {sum(s.pinyin for s in songs)}')

    heading(f"Files that couldn't be read ({len(unreadable) + len(empty)})")
    for rel, reason in unreadable:
        print(f'  {rel}: {reason}')
    for song in empty:
        print(f'  {song.rel}: no words left after taking out the chords')
    if not unreadable and not empty:
        print('  none')

    no_labels = [s for s in songs if s.unlabelled]
    heading(f'Files with no section labels ({len(no_labels)}) - slides are called Slide 1, Slide 2...')
    for song in no_labels:
        print(f'  {song.rel}  ({song.title}, {len(song.slides)} slides)')

    noted = [s for s in songs if s.notes]
    heading(f'Musician notes left out ({sum(len(s.notes) for s in songs)} in {len(noted)} songs)')
    for song in noted:
        for text, where in song.notes:
            print(f'  {song.rel}: {text!r} in {where}')

    dropped = Counter(re.sub(r'\s*\d+$', '', name) for s in songs for name in s.dropped_sections)
    heading(f'Sections with no words, left out ({sum(dropped.values())})')
    print('  ' + ', '.join(f'{name} x{count}' for name, count in dropped.most_common()))

    unknown = [(s, label) for s in songs for label in s.unknown_labels]
    if unknown:
        heading(f'Labels not recognised, kept as written ({len(unknown)})')
        for song, label in unknown:
            print(f'  {song.rel}: [{label}]')

    unpaired = [(s, text, where) for s in songs for text, where in s.unpaired]
    if unpaired:
        heading(f'Bilingual lines without a partner ({len(unpaired)}) - used as they are in the English-only and Chinese-only songs')
        for song, text, where in unpaired:
            print(f'  {song.rel}: {text!r} in {where}')

    kept = [(s, text, where) for s in songs for text, where in s.kept_parens]
    heading(f'Kept in parentheses, sung words ({len(kept)}) - check none is a note')
    for text, count in Counter(text for _, text, _ in kept).most_common():
        print(f'  {text}' + (f'  x{count}' if count > 1 else ''))

    dashed = [(s, line) for s in songs for slide in s.slides for line in slide['text'].split('\n')
              if re.search(r'\s[-–—]|[-–—]\s', line)]
    heading(f'Lines that still have a spaced dash ({len(dashed)}) - check these by hand')
    for song, line in dashed:
        print(f'  {song.title}: {line}')

    joined = Counter(text for s in songs for text in s.joined)
    heading(f'Split syllables joined ({sum(joined.values())})')
    print('  ' + ', '.join(f'{text!r}' + (f' x{n}' if n > 1 else '') for text, n in joined.most_common()))

    long = [(s, slide) for s in songs for slide in s.slides if slide['text'].count('\n') + 1 > LONG_SLIDE]
    heading(f'Slides over {LONG_SLIDE} lines ({len(long)}) - the editor will mark these as long')
    for song, count in Counter(s.title for s, _ in long).most_common():
        print(f'  {song} ({count})')

    samples = {title_key(t): t for t in sample_titles()}
    clashes = [s for s in songs if title_key(s.title) in samples]
    heading(f'Same title as a built-in sample song ({len(clashes)}) - Restore will ask about these')
    for song in clashes:
        print(f'  {song.title}')

    if args.show:
        wanted = ['build-my-life', 'how-deep-the-father-s-love', 'holy-forever', 'blessed-assurance', 'good-grace']
        by_stem = {s.path.stem: s for s in songs}
        picks = [by_stem[stem] for stem in wanted if stem in by_stem]
        picks += [s for s in songs if s not in picks]
        for song in picks[:args.show]:
            for data in records(song):
                heading(f'{data["title"]}  (key {song.key or "?"}) - {song.rel}')
                print(editor_text(data['sections']))


if __name__ == '__main__':
    main()
