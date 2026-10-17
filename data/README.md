# Bible text

The app shows Bible passages from these two files. Each is loaded only when someone first shows a passage in that translation.

| File | Translation | Source |
| --- | --- | --- |
| `kjv.json` | King James Version (1769 standard text) | eBible.org, [`eng-kjv_usfm.zip`](https://ebible.org/Scriptures/eng-kjv_usfm.zip) |
| `web.json` | World English Bible (WEB Updated, eBible id `engwebu`) | eBible.org, [`engwebu_usfm.zip`](https://ebible.org/Scriptures/engwebu_usfm.zip) |

Downloaded 2026-10-17. Rebuild both files with `python3 tools/make-bible-data.py`.

## Licence

Both texts are in the **public domain**.

- **King James Version.** eBible.org's copyright page says: "Public Domain … You may copy the King James Version of the Holy Bible freely." In the United Kingdom, Crown letters patent control who may *print* the KJV, or import printed copies. That doesn't cover showing it on a screen. Outside the UK there are no limits at all. The text is provided courtesy of the CrossWire Bible Society and eBible.org.
- **World English Bible.** eBible.org's copyright page says: "The World English Bible is in the Public Domain. That means that it is not copyrighted. However, 'World English Bible' is a Trademark of eBible.org." The name may only be used for faithful copies.
  - We keep every verse word for word.
  - We change only the file format.
  - We leave out the footnotes, headings, Psalm titles and the Apocrypha.

## What the converter keeps and leaves out

- **Kept:** the words of each verse, exactly as published. This includes the KJV's words that were added in translation (printed in italics in a paper Bible) and "Selah".
- **Left out:**
  - footnotes and cross-references;
  - section headings;
  - Psalm titles such as "A Psalm of David." These come before verse 1 and are not part of it.
  - KJV colophons such as "Written to the Hebrews from Italy…";
  - speaker names in the Song of Solomon;
  - the KJV's ¶ paragraph marks;
  - the Apocrypha / Deuterocanon.
- **Empty verses:** the WEB has no main text for Luke 17:36, Acts 8:37, Acts 15:34, Acts 24:7 and Romans 16:25 (it gives them in footnotes). They are empty strings in `web.json`, and the app skips them.

## Format

```json
{"id": "kjv", "name": "King James Version", "source": "https://…", "books": [[["verse 1", "verse 2"], ["…chapter 2"]], ["…66 books"]]}
```

The books are in the order of `BOOKS` in `js/bible-books.js`. Chapter `c` and verse `v` are at `books[book][c - 1][v - 1]`.
