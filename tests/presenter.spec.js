// Browser checks for Worship Presenter.
// Phase 1: the Control and TV windows, keys, Black screen, Clear text, reloads, wake lock, auto-fit.
// Phase 2: the song library and switching between songs.
// Phase 3: adding, editing, deleting and searching songs.
//
// Every test gets a fresh browser profile, so storage starts empty and the
// sample songs are added on first load.

const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'worship-presenter:control';

// Fail any test that throws a page error in either window.
test.beforeEach(async ({ page, context }, testInfo) => {
  testInfo.pageErrors = [];
  const watch = (p, name) => p.on('pageerror', (e) => testInfo.pageErrors.push(`${name}: ${e.message}`));
  watch(page, 'Control');
  context.on('page', (p) => watch(p, 'TV'));
});

test.afterEach(async ({}, testInfo) => {
  expect(testInfo.pageErrors, 'page errors').toEqual([]);
});

// Helpers

async function openControl(page) {
  await page.goto('/');
  await expect(page.locator('.song')).toHaveCount(8);
}

async function openDisplay(page) {
  const [tv] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: 'Open display' }).click(),
  ]);
  await tv.waitForLoadState();
  await expect(page.locator('#display-status')).toHaveText('TV window is open');
  return tv;
}

const tile = (page, i) => page.locator('.tile').nth(i);
const tvText = (tv) => tv.locator('#text');
const liveTileIndex = (page) =>
  page.evaluate(() => [...document.querySelectorAll('.tile')].findIndex((t) => t.classList.contains('is-live')));
const songButton = (page, name) => page.locator('.song', { hasText: name });

async function expectLiveTile(page, i) {
  await expect.poll(() => liveTileIndex(page)).toBe(i);
}

test.describe('Phase 1', () => {
  test('start page shows the closed TV status and the tips', async ({ page }) => {
    await openControl(page);
    await expect(page.locator('#display-status')).toHaveText('TV window is closed');
    await expect(page.locator('#tips')).toBeVisible();
    await expect(page.locator('#live-note')).toHaveText('Nothing is on the TV yet. Pick a slide.');
    await expect(page.locator('#elsewhere')).toBeHidden();
  });

  test('Open display opens a waiting TV window', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await expect(tv.locator('body')).toHaveClass(/waiting/);
    await expect(page.locator('#tips')).toBeHidden();
  });

  test('clicking a slide puts it on the TV and lets go of focus', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await tile(page, 0).click();
    await expect(tvText(tv)).toHaveText(/^Amazing grace! How sweet the sound/);
    await expect(tv.locator('body')).not.toHaveClass(/waiting/);
    await expect(tile(page, 0)).toHaveClass(/is-live/);
    await expect(tile(page, 0).locator('.tile-live')).toHaveText('On the TV');
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    await expect(page.locator('#live-note')).toHaveText('The TV is showing Amazing Grace, Verse 1 (slide 1 of 5).');
  });

  test('arrows, PageUp/PageDown and Space move through the slides', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await tile(page, 0).click();
    const steps = [
      ['ArrowRight', 1], ['Space', 2], ['PageDown', 3], ['Enter', 4], ['ArrowRight', 4],
      ['ArrowLeft', 3], ['PageUp', 2], ['ArrowUp', 1], ['ArrowDown', 2],
    ];
    for (const [key, expected] of steps) {
      await page.keyboard.press(key);
      await expectLiveTile(page, expected);
    }
    await expect(tvText(tv)).toHaveText(/^Through many dangers/);
  });

  test('Space on a focused button only presses that button', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await tile(page, 1).click();
    await page.locator('#clear').focus();
    await page.keyboard.press('Space');
    await expectLiveTile(page, 1);
    await expect(tile(page, 1)).toHaveClass(/is-hidden/);
    await expect(tvText(tv)).toHaveText('');
  });

  test('a keyboard-focused slide keeps focus on the live slide', async ({ page }) => {
    await openControl(page);
    await tile(page, 0).focus();
    await page.keyboard.press('Enter');
    await expectLiveTile(page, 0);
    await page.keyboard.press('ArrowRight');
    await expectLiveTile(page, 1);
    expect(await page.evaluate(() => [...document.querySelectorAll('.tile')].indexOf(document.activeElement))).toBe(1);
  });

  test('keys pressed on the TV window are passed to the Control window', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await tile(page, 0).click();
    await tv.bringToFront();
    await tv.keyboard.press('ArrowRight');
    await expectLiveTile(page, 1);
    await tv.keyboard.press('ArrowLeft');
    await expectLiveTile(page, 0);
    await tv.keyboard.press('b');
    await expect(page.locator('#black')).toHaveAttribute('aria-pressed', 'true');
    await expect(tv.locator('body')).toHaveClass(/black/);
  });

  test('Black screen is a toggle that hides everything', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await tile(page, 1).click();
    await page.keyboard.press('b');
    await expect(page.locator('#black')).toHaveAttribute('aria-pressed', 'true');
    await expect(tile(page, 1)).toHaveClass(/is-hidden/);
    await expect(tile(page, 1).locator('.tile-live')).toHaveText('Black screen');
    await expect(page.locator('#live-note')).toHaveClass(/is-warning/);
    await expect(page.locator('#live-note')).toHaveText('The TV is black. Press Black screen or B to bring it back.');
    await expect(tv.locator('body')).toHaveClass(/black/);
    expect(await page.locator('#black').evaluate((b) => getComputedStyle(b).backgroundColor)).toBe('rgb(224, 103, 79)');

    await page.locator('#black').click();
    await expect(page.locator('#black')).toHaveAttribute('aria-pressed', 'false');
    await expect(tv.locator('body')).not.toHaveClass(/black/);
    await expect(tvText(tv)).toHaveText(/^’Twas grace/);
    await expect(tile(page, 1)).not.toHaveClass(/is-hidden/);
  });

  test('Clear text hides the words but keeps the slide; picking a slide brings them back', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await tile(page, 1).click();
    await page.locator('#clear').click();
    await expect(tvText(tv)).toHaveText('');
    await expectLiveTile(page, 1);
    await expect(tile(page, 1).locator('.tile-live')).toHaveText('Text cleared');
    await expect(page.locator('#live-note')).toHaveText('The words are cleared. Pick a slide to show it again.');
    await tile(page, 1).click();
    await expect(tvText(tv)).toHaveText(/^’Twas grace/);
    await expect(tile(page, 1)).not.toHaveClass(/is-hidden/);
  });

  test('reloading the Control page carries on and finds the open TV', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await tile(page, 2).click();
    await page.keyboard.press('b');

    // Record what the TV is sent, to make sure a reload never blanks it.
    await tv.evaluate(() => {
      window.seen = [];
      new BroadcastChannel('worship-presenter').onmessage = (e) => window.seen.push(e.data);
    });
    await page.reload();
    await expect(page.locator('.song')).toHaveCount(8);
    await expectLiveTile(page, 2);
    await expect(page.locator('#black')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#display-status')).toHaveText('TV window is open');
    await expect(tvText(tv)).toHaveText(/^Through many dangers/);
    const states = await tv.evaluate(() => window.seen.filter((m) => m.type === 'state'));
    expect(states.length).toBeGreaterThan(0);
    for (const s of states) expect(s.text).toMatch(/^Through many dangers/);
  });

  test('a reloaded TV window catches up', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await tile(page, 3).click();
    await tv.reload();
    await expect(tvText(tv)).toHaveText(/^The Lord has promised/);
    await expect(page.locator('#display-status')).toHaveText('TV window is open');
  });

  test('closing the TV window shows it as closed', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await tv.close({ runBeforeUnload: true });
    await expect(page.locator('#display-status')).toHaveText('TV window is closed');
    await expect(page.locator('#tips')).toBeVisible();
  });

  test('the TV asks for a wake lock once it shows something', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    // Nothing to show yet, so no lock.
    expect(await tv.evaluate(() => document.documentElement.dataset.wakeLock)).toBeUndefined();
    await tile(page, 0).click();
    // Headless browsers may refuse the lock; what matters is that it was asked for.
    await expect
      .poll(() => tv.evaluate(() => document.documentElement.dataset.wakeLock))
      .toMatch(/^(held|refused|unsupported)$/);
  });

  test('the TV auto-fits the longest verse at 800×600', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await tv.setViewportSize({ width: 800, height: 600 });
    for (const [song, slide] of [['Come, Thou Fount', 1], ['It Is Well', 2], ['Holy, Holy, Holy', 3]]) {
      await songButton(page, song).click();
      await tile(page, slide).click();
      await expect(tvText(tv)).not.toHaveText('');
      const fit = await tv.evaluate(async () => {
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const text = document.getElementById('text');
        const screen = document.getElementById('screen');
        const s = getComputedStyle(screen);
        const height = screen.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom);
        return {
          size: parseFloat(getComputedStyle(text).fontSize),
          max: Math.floor(height / 5),
          fits: text.scrollHeight <= Math.ceil(height) && text.scrollWidth <= text.clientWidth,
        };
      });
      expect(fit.fits, `${song} fits`).toBe(true);
      expect(fit.size).toBeLessThanOrEqual(fit.max);
      expect(fit.size).toBeGreaterThan(20);
    }
  });

  test('works at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openControl(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const id of ['#previous', '#next', '#black', '#clear']) await expect(page.locator(id)).toBeInViewport();
    await expect(page.locator('#black kbd')).toBeHidden();
  });
});

test.describe('Phase 2: song library', () => {
  test('lists the 8 sample hymns by title and stores them', async ({ page }) => {
    await openControl(page);
    await expect(page.locator('.song-name')).toHaveText([
      'Amazing Grace',
      'Be Thou My Vision',
      'Blessed Assurance',
      'Come, Thou Fount of Every Blessing',
      'Holy, Holy, Holy',
      'It Is Well with My Soul',
      'Rock of Ages',
      'What a Friend We Have in Jesus',
    ]);
    await expect(songButton(page, 'Amazing Grace')).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('#song-title')).toHaveText('Amazing Grace');
    const stored = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const open = indexedDB.open('worship-presenter');
          open.onsuccess = () => {
            const count = open.result.transaction('songs').objectStore('songs').count();
            count.onsuccess = () => resolve(count.result);
          };
        })
    );
    expect(stored).toBe(8);
  });

  test('tiles show section names, with choruses repeated in sung order', async ({ page }) => {
    await openControl(page);
    await expect(page.locator('.tile-label')).toHaveText(['Verse 1', 'Verse 2', 'Verse 3', 'Verse 4', 'Verse 5']);
    await expect(page.locator('.tile-number')).toHaveText(['1', '2', '3', '4', '5']);

    await songButton(page, 'It Is Well').click();
    await expect(page.locator('#song-title')).toHaveText('It Is Well with My Soul');
    await expect(page.locator('.tile-label')).toHaveText([
      'Verse 1', 'Chorus', 'Verse 2', 'Chorus', 'Verse 3', 'Chorus', 'Verse 4', 'Chorus',
    ]);

    await songButton(page, 'Blessed Assurance').click();
    await expect(page.locator('.tile-label')).toHaveText(['Verse 1', 'Chorus', 'Verse 2', 'Chorus', 'Verse 3', 'Chorus']);
    await expect(tile(page, 1).locator('.tile-text')).toHaveText(/^This is my story/);
  });

  test('looking at another song does not change the TV, and marks which is which', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await tile(page, 1).click();
    await songButton(page, 'Rock of Ages').click();

    await expect(tvText(tv)).toHaveText(/^’Twas grace/);
    await expect(songButton(page, 'Rock of Ages')).toHaveAttribute('aria-current', 'true');
    await expect(songButton(page, 'Amazing Grace')).toHaveClass(/is-live/);
    await expect(songButton(page, 'Amazing Grace').locator('.song-live')).toBeVisible();
    await expect(songButton(page, 'Rock of Ages').locator('.song-live')).toBeHidden();
    await expectLiveTile(page, -1);
    await expect(page.locator('#elsewhere')).toBeVisible();
    await expect(page.locator('#elsewhere-text')).toHaveText(
      'The TV is showing Amazing Grace, Verse 2. Next keeps going through that song, then starts this one.'
    );
    // A mouse click on a song lets Space mean "next slide" again.
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  });

  test('Next finishes the song on the TV, then starts the song being viewed', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await tile(page, 1).click();
    await songButton(page, 'Rock of Ages').click();

    for (const start of ['Through many dangers', 'The Lord has promised', 'When we’ve been there']) {
      await page.keyboard.press('Space');
      await expect(tvText(tv)).toHaveText(new RegExp(`^${start}`));
      await expect(songButton(page, 'Amazing Grace')).toHaveClass(/is-live/);
    }
    await page.keyboard.press('Space');
    await expect(tvText(tv)).toHaveText(/^Rock of Ages, cleft for me/);
    await expect(songButton(page, 'Rock of Ages')).toHaveClass(/is-live/);
    await expectLiveTile(page, 0);
    await expect(page.locator('#elsewhere')).toBeHidden();

    // Previous never goes back to the earlier song.
    await page.keyboard.press('ArrowLeft');
    await expectLiveTile(page, 0);
    await expect(tvText(tv)).toHaveText(/^Rock of Ages, cleft for me/);
  });

  test('Previous stays within the song on the TV while viewing another', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await tile(page, 2).click();
    await songButton(page, 'Holy, Holy, Holy').click();
    await page.keyboard.press('ArrowLeft');
    await expect(tvText(tv)).toHaveText(/^’Twas grace/);
    await expect(page.locator('#elsewhere-text')).toContainText('Amazing Grace, Verse 2');
  });

  test('clicking a slide in another song shows it straight away', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await tile(page, 0).click();
    await songButton(page, 'Holy, Holy, Holy').click();
    await tile(page, 2).click();
    await expect(tvText(tv)).toHaveText(/^Holy, holy, holy! Though the darkness/);
    await expect(songButton(page, 'Holy, Holy, Holy')).toHaveClass(/is-live/);
    await expect(songButton(page, 'Amazing Grace')).not.toHaveClass(/is-live/);
    await expect(page.locator('#live-note')).toHaveText('The TV is showing Holy, Holy, Holy, Verse 3 (slide 3 of 4).');
  });

  test('Go to that song shows the song on the TV', async ({ page }) => {
    await openControl(page);
    await songButton(page, 'Holy, Holy, Holy').click();
    await tile(page, 2).click();
    await songButton(page, 'Be Thou My Vision').click();
    await page.locator('#go-live-song').click();
    await expect(page.locator('#song-title')).toHaveText('Holy, Holy, Holy');
    await expect(page.locator('#elsewhere')).toBeHidden();
    await expectLiveTile(page, 2);
  });

  test('a reload keeps both the song on the TV and the song being viewed', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await songButton(page, 'Holy, Holy, Holy').click();
    await tile(page, 2).click();
    await songButton(page, 'What a Friend').click();
    await page.reload();
    await expect(page.locator('.song')).toHaveCount(8);
    await expect(songButton(page, 'What a Friend')).toHaveAttribute('aria-current', 'true');
    await expect(songButton(page, 'Holy, Holy, Holy')).toHaveClass(/is-live/);
    await expect(page.locator('#elsewhere-text')).toContainText('Holy, Holy, Holy, Verse 3');
    await expect(tvText(tv)).toHaveText(/^Holy, holy, holy! Though the darkness/);
    // Next still carries on through the song on the TV.
    await page.keyboard.press('Space');
    await expect(tvText(tv)).toHaveText(/^Holy, holy, holy! Lord God Almighty!\s+All Thy works/);
  });

  for (const [name, saved] of [
    ['a song that no longer exists', JSON.stringify({ songId: 'gone', index: 7, viewId: 'also-gone', black: 'yes' })],
    ['broken saved data', '{not json'],
  ]) {
    test(`${name} in saved state falls back cleanly`, async ({ page }) => {
      await openControl(page);
      await page.evaluate(([key, value]) => sessionStorage.setItem(key, value), [STORAGE_KEY, saved]);
      await page.reload();
      await expect(page.locator('.song')).toHaveCount(8);
      await expect(songButton(page, 'Amazing Grace')).toHaveAttribute('aria-current', 'true');
      await expectLiveTile(page, -1);
      await expect(page.locator('#black')).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('#live-note')).toHaveText('Nothing is on the TV yet. Pick a slide.');
    });
  }

  test('the samples come back if the library is deleted', async ({ page }) => {
    await openControl(page);
    await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const del = indexedDB.deleteDatabase('worship-presenter');
          del.onsuccess = resolve;
          del.onerror = reject;
        })
    );
    await page.reload();
    await expect(page.locator('.song')).toHaveCount(8);
  });

  test('on a phone the songs sit in two columns and picking one scrolls to its slides', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openControl(page);
    const columns = await page.locator('#songs').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(2);
    await songButton(page, 'Rock of Ages').click();
    await expect(page.locator('#song-title')).toHaveText('Rock of Ages');
    await expect(page.locator('#song-title')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

test.describe('Phase 3: song editor', () => {
  const title = (page) => page.locator('#editor-song-title');
  const lyrics = (page) => page.locator('#editor-lyrics');
  const preview = (page) => page.locator('.preview-tile');
  const button = (page, name) => page.getByRole('button', { name, exact: true });

  async function addSong(page, songTitle, words) {
    await page.locator('#add-song').click();
    await title(page).fill(songTitle);
    await lyrics(page).fill(words);
    await button(page, 'Save song').click();
    await expect(page.locator('#editor')).toBeHidden();
  }

  async function editViewedSong(page, change) {
    await button(page, 'Edit song').click();
    await expect(page.locator('#editor')).toBeVisible();
    await lyrics(page).fill(change(await lyrics(page).inputValue()));
  }

  async function deleteViewedSong(page) {
    await button(page, 'Edit song').click();
    await button(page, 'Delete song').click();
    await button(page, 'Yes, delete it').click();
    await expect(page.locator('#editor')).toBeHidden();
  }

  test('adding a song shows a live preview and only changes the TV once saved', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await tile(page, 0).click();

    await page.locator('#add-song').click();
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('#main')).toBeHidden();
    await expect(page.locator('#editor-title')).toHaveText('Add a song');
    await expect(page.locator('.editor-note')).toHaveText(
      'Songs you add are saved on this device only. For songs still under copyright, your group needs a CCLI licence.'
    );
    await expect(button(page, 'Delete song')).toBeHidden();
    await expect(button(page, 'Restore original')).toBeHidden();
    await expect(page.locator('#preview-count')).toHaveText('Type the words above to see the slides.');

    await title(page).fill('A Test Song');
    await lyrics(page).fill('[Verse 1]\nFirst line\nSecond line\n\n[Chorus]\nSing it out\n\n[Verse 2]\nThird line\n\n[Chorus]');
    await expect(preview(page).locator('.tile-label')).toHaveText(['Verse 1', 'Chorus', 'Verse 2', 'Chorus']);
    await expect(preview(page).nth(3).locator('.tile-text')).toHaveText('Sing it out');
    await expect(page.locator('#preview-count')).toHaveText('4 slides');
    await expect(tvText(tv)).toHaveText(/^Amazing grace/);
    // The bottom bar still runs the TV while the editor is open.
    await page.locator('#next').click();
    await expect(tvText(tv)).toHaveText(/^’Twas grace/);

    await button(page, 'Save song').click();
    await expect(page.locator('#editor')).toBeHidden();
    await expect(page.locator('#main')).toBeVisible();
    await expect(page.locator('#song-title')).toHaveText('A Test Song');
    await expect(page.locator('.song-name').first()).toHaveText('A Test Song');
    await expect(page.locator('.tile-label')).toHaveText(['Verse 1', 'Chorus', 'Verse 2', 'Chorus']);
    await expect(tvText(tv)).toHaveText(/^’Twas grace/);
    await expect(page.locator('#elsewhere')).toBeVisible();

    await page.reload();
    await expect(page.locator('.song')).toHaveCount(9);
    await expect(page.locator('#song-title')).toHaveText('A Test Song');
    const stored = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const open = indexedDB.open('worship-presenter');
          open.onsuccess = () => {
            const all = open.result.transaction('songs').objectStore('songs').getAll();
            all.onsuccess = () => resolve(all.result.find((song) => song.title === 'A Test Song'));
          };
        })
    );
    expect(stored.sections.map((s) => s.name)).toEqual(['Verse 1', 'Chorus', 'Verse 2']);
    expect(stored.order).toEqual(['Verse 1', 'Chorus', 'Verse 2', 'Chorus']);
  });

  test('slides without a label are numbered, and a sample opens with its labels', async ({ page }) => {
    await openControl(page);
    await page.locator('#add-song').click();
    await lyrics(page).fill('One\nTwo\n\nThree\nFour');
    await expect(preview(page).locator('.tile-label')).toHaveText(['Slide 1', 'Slide 2']);
    await button(page, 'Cancel').click();
    await button(page, 'Throw away changes').click();

    await songButton(page, 'It Is Well').click();
    await button(page, 'Edit song').click();
    await expect(page.locator('#editor-title')).toHaveText('Edit song');
    await expect(title(page)).toHaveValue('It Is Well with My Soul');
    const words = await lyrics(page).inputValue();
    expect(words.startsWith('[Verse 1]\nWhen peace like a river')).toBe(true);
    // The chorus is written out once, then repeated with just its label.
    expect(words.split('\n\n').filter((block) => block === '[Chorus]')).toHaveLength(3);
    await expect(preview(page)).toHaveCount(8);
  });

  test('the editor asks for a title and words', async ({ page }) => {
    await openControl(page);
    await page.locator('#add-song').click();
    await button(page, 'Save song').click();
    await expect(page.locator('#title-error')).toHaveText('Give the song a title.');
    await expect(title(page)).toBeFocused();
    await title(page).fill('Only a title');
    await expect(page.locator('#title-error')).toBeHidden();
    await button(page, 'Save song').click();
    await expect(page.locator('#lyrics-error')).toHaveText('Type the words of at least one slide.');
    await expect(lyrics(page)).toBeFocused();
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('.song')).toHaveCount(8);
  });

  test('keys typed in the editor or the search box do not move the TV', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await tile(page, 0).click();

    await page.locator('#search').click();
    for (const key of ['ArrowDown', 'ArrowRight', 'PageDown', 'b', 'Space']) await page.keyboard.press(key);
    await expect(page.locator('#search')).toHaveValue('b ');
    await page.locator('#search').fill('');

    await page.locator('#add-song').click();
    await lyrics(page).click();
    for (const key of ['ArrowDown', 'ArrowRight', 'PageDown', 'b', 'Space', 'Enter']) await page.keyboard.press(key);
    await title(page).click();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('B');

    await expect(tvText(tv)).toHaveText(/^Amazing grace/);
    await expect(page.locator('#black')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#live-note')).toHaveText('The TV is showing Amazing Grace, Verse 1 (slide 1 of 5).');
  });

  test('saving the song on the TV updates the TV and keeps the slide', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await tile(page, 2).click();

    await editViewedSong(page, (words) => words.replace('Through many dangers', 'Through many perils'));
    await expect(preview(page).nth(2).locator('.tile-text')).toHaveText(/^Through many perils/);
    await expect(tvText(tv)).toHaveText(/^Through many dangers/);
    await button(page, 'Save song').click();
    await expect(tvText(tv)).toHaveText(/^Through many perils/);
    await expectLiveTile(page, 2);

    // Verse 1 removed: Verse 3 moves up, and the TV stays on it.
    await editViewedSong(page, (words) => words.replace(/^\[Verse 1\][^[]*/, ''));
    await button(page, 'Save song').click();
    await expect(page.locator('.tile-label')).toHaveText(['Verse 2', 'Verse 3', 'Verse 4', 'Verse 5']);
    await expectLiveTile(page, 1);
    await expect(tvText(tv)).toHaveText(/^Through many perils/);
    await expect(page.locator('#live-note')).toHaveText('The TV is showing Amazing Grace, Verse 3 (slide 2 of 4).');

    // The slide on the TV removed: the TV shows the slide now in its place.
    await editViewedSong(page, (words) => words.replace(/\[Verse 3\][^[]*/, ''));
    await button(page, 'Save song').click();
    await expectLiveTile(page, 1);
    await expect(tvText(tv)).toHaveText(/^The Lord has promised/);

    // Cleared words stay cleared after a save.
    await page.locator('#clear').click();
    await editViewedSong(page, (words) => words.replace('The Lord has promised', 'The Lord hath promised'));
    await button(page, 'Save song').click();
    await expect(tvText(tv)).toHaveText('');
    await tile(page, 1).click();
    await expect(tvText(tv)).toHaveText(/^The Lord hath promised/);
  });

  test('an edited sample can be put back to the original', async ({ page }) => {
    await openControl(page);
    // Saving a sample with no changes doesn't count as editing it.
    await button(page, 'Edit song').click();
    await expect(button(page, 'Restore original')).toBeHidden();
    await button(page, 'Save song').click();
    await button(page, 'Edit song').click();
    await expect(button(page, 'Restore original')).toBeHidden();

    await lyrics(page).fill((await lyrics(page).inputValue()).replace('Amazing grace!', 'Amazing love!'));
    await button(page, 'Save song').click();
    await expect(tile(page, 0).locator('.tile-text')).toHaveText(/^Amazing love!/);

    await button(page, 'Edit song').click();
    await button(page, 'Restore original').click();
    await expect(page.locator('#confirm-text')).toHaveText(
      'Put back the original words? Your changes to this song will be lost.'
    );
    await button(page, 'Keep my version').click();
    await expect(page.locator('#editor-confirm')).toBeHidden();
    await expect(button(page, 'Restore original')).toBeFocused();
    await button(page, 'Restore original').click();
    await button(page, 'Put back the original').click();
    await expect(page.locator('#editor')).toBeHidden();
    await expect(tile(page, 0).locator('.tile-text')).toHaveText(/^Amazing grace!/);
    await button(page, 'Edit song').click();
    await expect(button(page, 'Restore original')).toBeHidden();
  });

  test('sample updates in the repo never overwrite an edited copy', async ({ page }) => {
    await openControl(page);
    await editViewedSong(page, (words) => words.replace('Amazing grace!', 'Amazing love!'));
    await button(page, 'Save song').click();

    await page.route('**/js/sample-songs.js', async (route) => {
      const response = await route.fetch();
      const body = (await response.text())
        .replace('Amazing grace! How sweet', 'NEW Amazing grace! How sweet')
        .replace('Rock of Ages, cleft for me,\\nLet me hide', 'NEW Rock of Ages, cleft for me,\\nLet me hide');
      await route.fulfill({ response, body });
    });
    await page.reload();
    await expect(page.locator('.song')).toHaveCount(8);
    await expect(tile(page, 0).locator('.tile-text')).toHaveText(/^Amazing love!/);
    await songButton(page, 'Rock of Ages').click();
    await expect(tile(page, 0).locator('.tile-text')).toHaveText(/^NEW Rock of Ages/);
  });

  test('deleting asks first, and a deleted sample stays deleted', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await songButton(page, 'Rock of Ages').click();
    await tile(page, 0).click();

    await button(page, 'Edit song').click();
    await button(page, 'Delete song').click();
    await expect(page.locator('#confirm-text')).toHaveText('Delete ‘Rock of Ages’? This can’t be undone.');
    await expect(page.locator('#editor-actions')).toBeHidden();
    await button(page, 'Keep it').click();
    await expect(page.locator('#editor')).toBeVisible();
    await button(page, 'Cancel').click();
    await expect(page.locator('.song')).toHaveCount(8);

    await deleteViewedSong(page);
    await expect(page.locator('.song')).toHaveCount(7);
    await expect(songButton(page, 'Rock of Ages')).toHaveCount(0);
    await expect(tvText(tv)).toHaveText('');
    await expect(page.locator('#live-note')).toHaveText('Nothing is on the TV yet. Pick a slide.');
    await expect(page.locator('#song-title')).toHaveText('Amazing Grace');

    await page.reload();
    await expect(page.locator('.song')).toHaveCount(7);
    await expect(songButton(page, 'Rock of Ages')).toHaveCount(0);
  });

  test('a song you added can be deleted for good', async ({ page }) => {
    await openControl(page);
    await addSong(page, 'Gone Soon', 'Words');
    await expect(page.locator('.song')).toHaveCount(9);
    await deleteViewedSong(page);
    await expect(page.locator('.song')).toHaveCount(8);
    await expect(page.locator('#bring-back')).toBeHidden();
  });

  test('Bring back deleted sample songs returns them and leaves edited ones alone', async ({ page }) => {
    await openControl(page);
    await expect(page.locator('#bring-back')).toBeHidden();
    await editViewedSong(page, (words) => words.replace('Amazing grace!', 'Amazing love!'));
    await button(page, 'Save song').click();

    for (const name of ['Rock of Ages', 'Holy, Holy, Holy']) {
      await songButton(page, name).click();
      await deleteViewedSong(page);
    }
    await expect(page.locator('.song')).toHaveCount(6);
    await expect(page.locator('#bring-back')).toBeVisible();

    await page.locator('#bring-back').click();
    await expect(page.locator('.song')).toHaveCount(8);
    await expect(page.locator('#bring-back')).toBeHidden();
    await page.reload();
    await expect(page.locator('.song')).toHaveCount(8);
    await expect(page.locator('#bring-back')).toBeHidden();
    await songButton(page, 'Amazing Grace').click();
    await expect(tile(page, 0).locator('.tile-text')).toHaveText(/^Amazing love!/);
  });

  test('search finds songs by title or words', async ({ page }) => {
    await openControl(page);
    const search = page.locator('#search');
    const visibleNames = () => page.locator('.song:visible .song-name');

    await search.fill('rock');
    await expect(visibleNames()).toHaveText(['Rock of Ages']);
    await search.fill('WRETCH');
    await expect(visibleNames()).toHaveText(['Amazing Grace']);
    // Straight and curly apostrophes, and punctuation, don't matter.
    await search.fill("'twas grace that taught");
    await expect(visibleNames()).toHaveText(['Amazing Grace']);
    await search.fill('holy holy');
    await expect(visibleNames()).toHaveText(['Holy, Holy, Holy']);

    await search.fill('zebra');
    await expect(page.locator('.song:visible')).toHaveCount(0);
    await expect(page.locator('#no-match')).toHaveText('No songs match ‘zebra’.');
    await search.fill('');
    await expect(page.locator('.song:visible')).toHaveCount(8);
    await expect(page.locator('#no-match')).toBeHidden();

    // A new song is found too, and the search stays after saving.
    await search.fill('rock');
    await addSong(page, 'Solid Rock Test', 'On Christ the solid rock I stand');
    await expect(visibleNames()).toHaveText(['Rock of Ages', 'Solid Rock Test']);
  });

  test('Cancel asks first only when something changed', async ({ page }) => {
    await openControl(page);
    await button(page, 'Edit song').click();
    await button(page, 'Cancel').click();
    await expect(page.locator('#editor')).toBeHidden();

    await button(page, 'Edit song').click();
    await title(page).fill('Changed');
    await button(page, 'Cancel').click();
    await expect(page.locator('#confirm-text')).toHaveText('Throw away your changes?');
    await button(page, 'Keep editing').click();
    await expect(title(page)).toHaveValue('Changed');
    await button(page, 'Cancel').click();
    await button(page, 'Throw away changes').click();
    await expect(page.locator('#editor')).toBeHidden();
    await expect(page.locator('#song-title')).toHaveText('Amazing Grace');
  });

  test('pasted words with a blank line after every line can be joined into verses', async ({ page }) => {
    await openControl(page);
    await page.locator('#add-song').click();
    const nine = Array.from({ length: 9 }, (_, i) => `Line ${i + 1}`).join('\n\n');
    await lyrics(page).fill(nine);
    await expect(preview(page)).toHaveCount(9);
    await expect(page.locator('#join-notice')).toBeVisible();
    await expect(page.locator('#join-notice p')).toHaveText(
      'It looks like every line became its own slide. Join lines into verses?'
    );
    await button(page, 'Join lines into verses').click();
    await expect(preview(page)).toHaveCount(3);
    await expect(preview(page).locator('.tile-text')).toHaveText([
      'Line 1\nLine 2\nLine 3\nLine 4',
      'Line 5\nLine 6\nLine 7\nLine 8',
      'Line 9',
    ]);
    await expect(page.locator('#join-notice')).toBeHidden();

    // A label starts a new slide.
    await lyrics(page).fill('A\n\nB\n\n[Chorus]\n\nC\n\nD\n\nE');
    await expect(page.locator('#join-notice')).toBeVisible();
    await button(page, 'Join lines into verses').click();
    await expect(lyrics(page)).toHaveValue('A\nB\n\n[Chorus]\nC\nD\nE');
    await expect(preview(page).locator('.tile-label')).toHaveText(['Slide 1', 'Chorus']);

    // Normal verses never show the notice.
    await lyrics(page).fill('One\nTwo\n\nThree\nFour\n\nFive\nSix\n\nSeven\nEight');
    await expect(preview(page)).toHaveCount(4);
    await expect(page.locator('#join-notice')).toBeHidden();
  });

  test('a slide with more than 6 lines gets a gentle note', async ({ page }) => {
    await openControl(page);
    await page.locator('#add-song').click();
    const lines = (n) => Array.from({ length: n }, (_, i) => `Line ${i + 1}`).join('\n');
    await lyrics(page).fill(`${lines(6)}\n\n${lines(7)}`);
    await expect(preview(page)).toHaveCount(2);
    await expect(preview(page).nth(0).locator('.long-note')).toBeHidden();
    await expect(preview(page).nth(1)).toHaveClass(/is-long/);
    await expect(preview(page).nth(1).locator('.long-note')).toHaveText(
      'This slide is long and the words will be small on the TV. Add a blank line to split it.'
    );
  });

  test('the editor works at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openControl(page);
    await button(page, 'Edit song').click();
    await expect(page.locator('#editor')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const id of ['#previous', '#next', '#black', '#clear']) await expect(page.locator(id)).toBeInViewport();
    await button(page, 'Save song').scrollIntoViewIfNeeded();
    await expect(button(page, 'Save song')).toBeInViewport();
  });
});
