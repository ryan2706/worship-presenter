// Shared messaging between the Control window and the Display window.
//
// Control -> Display
//   { type: 'state', text, caption, black }
//                                    the full picture for the TV, sent every time.
//                                    `caption` is the Bible reference ('' for songs).
//   { type: 'ping' }                 "is a Display open?" (sent when Control loads)
// Display -> Control
//   { type: 'hello' }                "I'm open" (on load, and in reply to ping)
//   { type: 'bye' }                  "I'm closing"
//   { type: 'key', action }          a shortcut pressed while the TV window had focus

export const CHANNEL_NAME = 'worship-presenter';

export function openChannel(onMessage) {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.addEventListener('message', (event) => onMessage(event.data || {}));
  return {
    send: (message) => channel.postMessage(message),
  };
}

// Turns a key press into a slide action, or null if the key isn't a shortcut.
// Space and Enter only count when focus isn't on something that already uses
// them (a button, link or form field), so one key press does one thing.
// While someone is typing in a text box, no key is a shortcut.
export function shortcutFor(event) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return null;
  if (isTyping(document.activeElement)) return null;

  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case 'PageDown':
      return 'next';
    case 'ArrowLeft':
    case 'ArrowUp':
    case 'PageUp':
      return 'previous';
    case 'b':
    case 'B':
      return 'black';
    case ' ':
    case 'Enter':
      return usesSpaceAndEnter(document.activeElement) ? null : 'next';
    default:
      return null;
  }
}

function usesSpaceAndEnter(element) {
  return Boolean(
    element &&
      element.closest('button, a[href], input, select, textarea, summary, [contenteditable]:not([contenteditable="false"])')
  );
}

function isTyping(element) {
  return Boolean(
    element &&
      element.closest(
        'textarea, select, [contenteditable]:not([contenteditable="false"]), ' +
          'input:not([type="button"], [type="checkbox"], [type="radio"], [type="submit"], [type="reset"], [type="range"], [type="color"], [type="file"])'
      )
  );
}
