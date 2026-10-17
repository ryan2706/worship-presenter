// Turns the editor's one big lyrics box into a song, and a song back into text.
//
//   A blank line starts a new slide.
//   A line like [Verse 1] or [Chorus] on its own names the slide below it.
//   A label with no words under it repeats the earlier slide with that name,
//   so a chorus can be sung again without typing it twice.
//   Slides without a label are called "Slide 1", "Slide 2" and so on.

import { slidesFor } from './library.js';

const LABEL = /^\s*\[([^\[\]]+)\]\s*$/;

// Splits the text into labels and blocks of lines, in order.
function tokens(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n').map((line) => line.trimEnd());
  const result = [];
  let block = null;
  for (const line of lines) {
    const label = line.match(LABEL);
    if (!line.trim()) {
      block = null;
    } else if (label) {
      block = null;
      result.push({ label: label[1].trim() });
    } else {
      if (!block) {
        block = { lines: [] };
        result.push(block);
      }
      block.lines.push(line);
    }
  }
  return result;
}

// The slides as written: [{ name, text, repeat }].
function parseSlides(text) {
  const slides = [];
  let label = null;
  const repeat = (name) => {
    const earlier = slides.findLast((slide) => !slide.repeat && slide.name.toLowerCase() === name.toLowerCase());
    if (earlier) slides.push({ name: earlier.name, text: earlier.text, repeat: true });
  };
  for (const token of tokens(text)) {
    if (token.label) {
      if (label) repeat(label);
      label = token.label;
    } else {
      slides.push({ name: label ?? `Slide ${slides.length + 1}`, text: token.lines.join('\n'), repeat: false });
      label = null;
    }
  }
  if (label) repeat(label);
  return slides;
}

// Returns { sections, order? } ready to store on a song.
export function parseLyrics(text) {
  const slides = parseSlides(text);
  const written = slides.filter((slide) => !slide.repeat);
  const names = written.map((slide) => slide.name);
  const sections = (list) => list.map(({ name, text }) => ({ name, text }));

  // The same label used twice with different words: keep the slides as written.
  if (new Set(names).size !== names.length) return { sections: sections(slides) };
  if (written.length === slides.length) return { sections: sections(written) };
  return { sections: sections(written), order: slides.map((slide) => slide.name) };
}

// The song's words as the editor shows them. Repeats are written as just the label.
export function formatLyrics(song) {
  const seen = new Set();
  const repeats = Boolean(song.order);
  return slidesFor(song)
    .map(({ name, text }, i) => {
      if (repeats && seen.has(name)) return `[${name}]`;
      seen.add(name);
      return name === `Slide ${i + 1}` ? text : `[${name}]\n${text}`;
    })
    .join('\n\n');
}

// True when the words look pasted with a blank line after every line.
export function looksLikeOneLinePerSlide(text) {
  const blocks = tokens(text).filter((token) => token.lines);
  return blocks.length >= 4 && blocks.every((block) => block.lines.length === 1);
}

// Joins runs of one-line slides into slides of up to `size` lines.
// A label always starts a new slide.
export function joinSingleLines(text, size = 4) {
  const items = [];
  let label = null;
  let open = null;
  for (const token of tokens(text)) {
    if (token.label) {
      if (label) items.push({ label, lines: [] });
      label = token.label;
      open = null;
    } else if (token.lines.length === 1 && open && !label && open.lines.length < size) {
      open.lines.push(token.lines[0]);
    } else {
      const item = { label, lines: [...token.lines] };
      items.push(item);
      open = token.lines.length === 1 ? item : null;
      label = null;
    }
  }
  if (label) items.push({ label, lines: [] });
  return items.map(({ label, lines }) => [...(label ? [`[${label}]`] : []), ...lines].join('\n')).join('\n\n');
}
