// The Bible translations the app can show. This is the only place they are
// listed: the translation picker, the captions and the notices are all built
// from this list, so adding a translation means adding one line here.
//
// A translation is
//   {
//     id,          short and stable, saved with passages ('kjv')
//     short,       shown on the TV after the reference ('KJV')
//     name,        shown in the picker ('King James Version')
//     notice,      copyright line shown with its passages ('' when none is needed)
//     getVerses(ref) -> Promise<[{ chapter, verse, text }]>
//   }
// getVerses checks the chapter and verse numbers and throws an Error whose
// message can be shown as it is. Only references are ever saved, never the
// words, so a translation with limits on stored text (such as the ESV) fits.
//
// Later, the ESV comes through a Cloudflare Worker that holds the API key:
//   import { proxyBible } from './bible-esv.js';
//   proxyBible({ id: 'esv', short: 'ESV', name: 'English Standard Version', url, notice: '…' })

import { versesIn } from './bible-reference.js';

const CANT_LOAD = 'The Bible text couldn’t be loaded. Check the internet connection and try again.';

export const TRANSLATIONS = [
  localBible({ id: 'kjv', short: 'KJV', name: 'King James Version', file: '../data/kjv.json' }),
  localBible({ id: 'web', short: 'WEB', name: 'World English Bible', file: '../data/web.json' }),
];

export function findTranslation(id) {
  return TRANSLATIONS.find((translation) => translation.id === id) ?? null;
}

// A public-domain Bible kept in this site's data/ folder. The file is only
// fetched the first time a passage from it is shown.
function localBible({ id, short, name, file }) {
  const url = new URL(file, import.meta.url);
  let loading = null;

  const load = () => {
    loading ??= fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return response.json();
      })
      .catch((error) => {
        // Let the next try fetch it again.
        loading = null;
        console.warn(`The ${short} text could not be loaded.`, error);
        throw new Error(CANT_LOAD);
      });
    return loading;
  };

  return {
    id,
    short,
    name,
    notice: '',
    async getVerses(ref) {
      const bible = await load();
      return versesIn(ref, bible.books[ref.book]);
    },
  };
}
