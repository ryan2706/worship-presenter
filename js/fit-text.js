// Makes the text inside `box` as large as it can be without spilling out.
// `textEl` should be a block inside `box`. Line breaks in the text are kept.
//
// Lyrics read best when each written line stays on one line, so we keep the
// lines whole unless that would make the text much smaller than letting long
// lines wrap.

const KEEP_LINES_WHOLE_IF_AT_LEAST = 0.7;

export function fitText(textEl, box, { min = 8, maxShare = 0.2 } = {}) {
  const style = getComputedStyle(box);
  const height = box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  if (height <= 0 || box.clientWidth <= 0 || !textEl.textContent.trim()) return;

  // Never larger than a fifth of the screen height, even for one short line.
  const max = Math.max(min, Math.floor(height * maxShare));

  const largestThatFits = (whiteSpace) => {
    textEl.style.whiteSpace = whiteSpace;
    const fits = (size) => {
      textEl.style.fontSize = `${size}px`;
      // The browser rounds these to whole pixels, so allow for that.
      return textEl.scrollHeight <= Math.ceil(height) && textEl.scrollWidth <= textEl.clientWidth;
    };
    let low = min;
    let high = max;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (fits(mid)) low = mid;
      else high = mid - 1;
    }
    return low;
  };

  const wrapped = largestThatFits('pre-line');
  const whole = largestThatFits('pre');

  if (whole >= wrapped * KEEP_LINES_WHOLE_IF_AT_LEAST) {
    textEl.style.whiteSpace = 'pre';
    textEl.style.fontSize = `${whole}px`;
  } else {
    textEl.style.whiteSpace = 'pre-line';
    textEl.style.fontSize = `${wrapped}px`;
  }
}

// Re-fits whenever the box changes size, and once the web font has loaded.
export function keepFitted(textEl, box, options) {
  const refit = () => fitText(textEl, box, options);
  new ResizeObserver(refit).observe(box);
  document.fonts?.ready.then(refit);
  return refit;
}
