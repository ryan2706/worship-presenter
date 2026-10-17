// Browser checks for Worship Presenter.
// Phase 1: the Control and TV windows, keys, Black screen, Clear text, reloads, wake lock, auto-fit.
// Phase 2: the song library and switching between songs.
// Phase 3: adding, editing, deleting and searching songs.
// Phase 4: backing up, restoring and sharing songs, and the backup reminder.
// Phase 5: the phone layout and reminder fixes, and Bible verses.
// Phase 6: the service order.
// Phase 7: GitHub Pages: working from a subfolder, the About page and the 404 page.
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

test.describe('Phase 4: backup, restore and sharing', () => {
  const fs = require('fs');
  const button = (page, name) => page.getByRole('button', { name, exact: true });
  const DAY = 24 * 60 * 60 * 1000;
  const REMINDER_KEY = 'worship-presenter:backup';

  async function addSong(page, songTitle, words) {
    await page.locator('#add-song').click();
    await page.locator('#editor-song-title').fill(songTitle);
    await page.locator('#editor-lyrics').fill(words);
    await button(page, 'Save song').click();
    await expect(page.locator('#editor')).toBeHidden();
  }

  async function editViewedSong(page, change) {
    await button(page, 'Edit song').click();
    const box = page.locator('#editor-lyrics');
    await box.fill(change(await box.inputValue()));
    await button(page, 'Save song').click();
    await expect(page.locator('#editor')).toBeHidden();
  }

  async function deleteViewedSong(page) {
    await button(page, 'Edit song').click();
    await button(page, 'Delete song').click();
    await button(page, 'Yes, delete it').click();
    await expect(page.locator('#editor')).toBeHidden();
  }

  // Presses a button that saves a file, and returns the file's name and contents.
  async function saveFileFrom(page, locator) {
    const [download] = await Promise.all([page.waitForEvent('download'), locator.click()]);
    return { name: download.suggestedFilename(), file: JSON.parse(fs.readFileSync(await download.path(), 'utf8')) };
  }

  async function chooseFile(page, contents, name = 'backup.json') {
    const text = typeof contents === 'string' ? contents : JSON.stringify(contents);
    await page.locator('#restore-file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(page.locator('#songs-file')).toBeVisible();
  }

  // Like opening the app in a different browser: no songs or settings yet.
  async function freshBrowser(page) {
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          localStorage.clear();
          sessionStorage.clear();
          indexedDB.deleteDatabase('worship-presenter').onsuccess = resolve;
        })
    );
    await page.reload();
    await expect(page.locator('.song')).toHaveCount(8);
  }

  const today = (page) =>
    page.evaluate(() => {
      const d = new Date();
      return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, '0')).join('-');
    });

  const song = (id, title, ...texts) => ({ id, title, sections: texts.map((text, i) => ({ name: `Slide ${i + 1}`, text })) });
  const fileWith = (songs, extra = {}) => ({ app: 'Worship Presenter', kind: 'backup', version: 1, songs, ...extra });

  test('Back up my songs saves your songs, edited samples and deleted samples in one file', async ({ page }) => {
    await openControl(page);
    await addSong(page, 'Our Song', '[Verse 1]\nOne\n\n[Chorus]\nTwo\n\n[Chorus]');
    await songButton(page, 'Amazing Grace').click();
    await editViewedSong(page, (words) => words.replace('Amazing grace!', 'Amazing love!'));
    await songButton(page, 'Rock of Ages').click();
    await deleteViewedSong(page);

    await expect(page.locator('.keep-safe-help')).toHaveText(
      'Your songs are saved in this browser only. A backup file keeps them safe and moves them to another computer.'
    );
    const { name, file } = await saveFileFrom(page, button(page, 'Back up my songs'));
    expect(name).toBe(`worship-songs-${await today(page)}.json`);
    expect(file).toMatchObject({ app: 'Worship Presenter', kind: 'backup', version: 1 });
    expect(Date.parse(file.savedAt)).not.toBeNaN();
    expect(file.songs).toHaveLength(3);
    const ours = file.songs.find((s) => s.title === 'Our Song');
    expect(ours.order).toEqual(['Verse 1', 'Chorus', 'Chorus']);
    expect(file.songs.find((s) => s.id === 'amazing-grace')).toMatchObject({ edited: true });
    expect(file.songs.find((s) => s.id === 'amazing-grace').sections[0].text).toMatch(/^Amazing love!/);
    expect(file.songs.find((s) => s.id === 'rock-of-ages')).toEqual({ id: 'rock-of-ages', deleted: true });
    await expect(page.locator('#file-note')).toHaveText(
      `Backup saved as ${name} with 2 songs you added or changed. Keep it somewhere safe, such as your email or cloud storage.`
    );
  });

  test('restoring a backup in another browser brings everything back', async ({ page }) => {
    await openControl(page);
    await addSong(page, 'Our Song', 'One\n\nTwo');
    await songButton(page, 'Amazing Grace').click();
    await editViewedSong(page, (words) => words.replace('Amazing grace!', 'Amazing love!'));
    await songButton(page, 'Rock of Ages').click();
    await deleteViewedSong(page);
    const { file } = await saveFileFrom(page, button(page, 'Back up my songs'));

    await freshBrowser(page);
    await chooseFile(page, file);
    await expect(page.locator('#main')).toBeHidden();
    await expect(page.locator('#songs-file-title')).toHaveText('Restore from backup');
    await expect(page.locator('#songs-file-title')).toBeFocused();
    await expect(page.locator('#restore-summary')).toHaveText('1 new song, 1 song you already have.');
    await expect(page.locator('#restore-added-list li')).toHaveText(['Our Song']);
    await expect(page.locator('#restore-existing-text')).toHaveText('It’s different from yours, so choose which to keep:');
    await expect(page.locator('#restore-all')).toBeHidden();
    // Yours is only the sample as it came with the app, so the backup's is suggested.
    const conflict = page.locator('.conflict');
    await expect(conflict.locator('.conflict-title')).toHaveText('Amazing Grace');
    await expect(conflict.locator('.conflict-meta')).toHaveText(
      'Yours is the sample that came with the app, with 5 slides. The backup’s has 5 slides.'
    );
    await expect(conflict.getByRole('button', { name: 'Use the backup’s' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#restore-extra')).toHaveText('1 sample song you had deleted will be hidden again: Rock of Ages.');

    await button(page, 'Restore songs').click();
    await expect(page.locator('#songs-file')).toBeHidden();
    await expect(page.locator('#main')).toBeVisible();
    await expect(page.locator('#file-note')).toHaveText('Done. We added 1 song, replaced 1 song and hid 1 deleted sample song.');
    await expect(page.locator('.song')).toHaveCount(8);
    await expect(songButton(page, 'Our Song')).toHaveCount(1);
    await expect(songButton(page, 'Rock of Ages')).toHaveCount(0);
    await songButton(page, 'Amazing Grace').click();
    await expect(tile(page, 0).locator('.tile-text')).toHaveText(/^Amazing love!/);

    // Restoring the same file again changes nothing.
    await chooseFile(page, file);
    await expect(page.locator('#restore-summary')).toHaveText('No new songs, 2 songs you already have.');
    await expect(page.locator('#restore-existing-text')).toHaveText('They’re exactly the same as yours, so they will be left as they are.');
    await expect(page.locator('#restore-extra')).toBeHidden();
    await button(page, 'Restore songs').click();
    await expect(page.locator('#file-note')).toHaveText('Nothing needed to change. You already have these songs.');
    await page.reload();
    await expect(page.locator('.song')).toHaveCount(8);
  });

  test('songs you already have: keep mine, use the backup’s or keep both, and nothing else is touched', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await addSong(page, 'Keep Me', 'Not in the file');
    await addSong(page, 'Same', 'Same words');
    await addSong(page, 'Mine', 'My words');
    await addSong(page, 'Mine Too', 'My other words');
    await songButton(page, 'Mine Too').click();
    await tile(page, 0).click();
    await expect(tvText(tv)).toHaveText('My other words');

    const file = fileWith([
      song('a', 'New One', 'Hello'),
      song('b', 'New Two', 'Hi'),
      song('c', 'Same', 'Same words'),
      song('d', 'mine', 'Backup words'),
      song('e', 'Mine Too', 'Backup other words'),
      { id: 'f', title: 'Broken' },
    ]);
    await chooseFile(page, file);
    await expect(page.locator('#restore-summary')).toHaveText('2 new songs, 3 songs you already have.');
    await expect(page.locator('#restore-existing-text')).toHaveText(
      '1 song is exactly the same as yours and will be left alone. For the other 2, choose what to do with each one:'
    );
    await expect(page.locator('#restore-extra')).toHaveText('1 song in the file couldn’t be read, so it will be skipped.');
    await expect(page.locator('.conflict-title')).toHaveText(['mine', 'Mine Too']);
    const pressed = (i) => page.locator('.conflict').nth(i).locator('[aria-pressed="true"]');
    await expect(pressed(0)).toHaveText('Keep mine');
    await expect(pressed(1)).toHaveText('Keep mine');

    // Cancel changes nothing.
    await button(page, 'Cancel').click();
    await expect(page.locator('#main')).toBeVisible();
    await expect(page.locator('.song')).toHaveCount(12);

    await chooseFile(page, file);
    await page.locator('#restore-all').getByRole('button', { name: 'Use the backup’s' }).click();
    await expect(pressed(0)).toHaveText('Use the backup’s');
    await expect(pressed(1)).toHaveText('Use the backup’s');
    await page.locator('.conflict').nth(0).getByRole('button', { name: 'Keep both' }).click();
    await expect(pressed(0)).toHaveText('Keep both');
    await button(page, 'Restore songs').click();

    await expect(page.locator('#file-note')).toHaveText('Done. We added 3 songs and replaced 1 song.');
    await expect(page.locator('.song')).toHaveCount(15);
    for (const name of ['Keep Me', 'New One', 'New Two', 'mine (from backup)']) await expect(songButton(page, name)).toHaveCount(1);
    await expect(page.locator('.song-name', { hasText: /^Same$/ })).toHaveCount(1);
    await songButton(page, 'Keep Me').click();
    await expect(tile(page, 0).locator('.tile-text')).toHaveText('Not in the file');
    await page.locator('.song-name', { hasText: /^Mine$/ }).click();
    await expect(tile(page, 0).locator('.tile-text')).toHaveText('My words');
    // The song on the TV was replaced, so the TV shows the new words.
    await expect(tvText(tv)).toHaveText('Backup other words');
    await expect(songButton(page, 'Mine Too')).toHaveClass(/is-live/);
  });

  test('files that can’t be used are explained in plain words', async ({ page }) => {
    await openControl(page);
    const problem = page.locator('#restore-problem');
    const cases = [
      ['not json at all', 'This file can’t be read. Pick a backup file saved from Worship Presenter. Its name ends in .json.'],
      [{ hello: 'world' }, 'This file isn’t a Worship Presenter backup. Pick a file saved with Back up my songs or Share songs.'],
      [fileWith([], { version: 2 }), 'This backup was made by a newer version of Worship Presenter. Reload this page to get the newest version, then try again.'],
      [fileWith([], { songs: 'nope' }), 'This backup file is damaged, so it can’t be used. Try another backup.'],
      [fileWith([]), 'This file has no songs in it.'],
      [fileWith([{ id: 'x', title: '' }]), 'None of the songs in this file could be read, so nothing can be restored.'],
    ];
    for (const [contents, message] of cases) {
      await chooseFile(page, contents);
      await expect(problem).toHaveText(message);
      await expect(page.locator('#restore-plan')).toBeHidden();
      await expect(button(page, 'Choose another file')).toBeVisible();
    }
    await button(page, 'Back to songs').click();
    await expect(page.locator('#main')).toBeVisible();
    await expect(page.locator('.song')).toHaveCount(8);
  });

  test('Share songs saves the ticked songs, and another group adds them with Restore', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await tile(page, 0).click();
    await addSong(page, 'Our Song', 'Our words');

    await button(page, 'Share songs').click();
    await expect(page.locator('#songs-file-title')).toHaveText('Share songs');
    await expect(page.locator('#main')).toBeHidden();
    const go = page.locator('#share-go');
    await expect(go).toBeDisabled();
    await expect(go).toHaveText('Tick the songs to share');
    await expect(page.locator('.share-song')).toHaveCount(9);

    // Space on a tick box ticks it and doesn't move the TV.
    await page.getByRole('checkbox', { name: 'Our Song' }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('checkbox', { name: 'Our Song' })).toBeChecked();
    await expect(tvText(tv)).toHaveText(/^Amazing grace/);
    await page.getByRole('checkbox', { name: 'Be Thou My Vision' }).check();
    await expect(go).toHaveText('Save 2 songs to a file');
    await button(page, 'Tick all').click();
    await expect(go).toHaveText('Save 9 songs to a file');
    await button(page, 'Untick all').click();
    await expect(go).toBeDisabled();
    await page.getByRole('checkbox', { name: 'Our Song' }).check();
    await page.getByRole('checkbox', { name: 'Be Thou My Vision' }).check();

    const { name, file } = await saveFileFrom(page, go);
    expect(name).toBe(`shared-songs-${await today(page)}.json`);
    expect(file).toMatchObject({ app: 'Worship Presenter', kind: 'shared', version: 1 });
    expect(file.songs.map((s) => s.title)).toEqual(['Be Thou My Vision', 'Our Song']);
    await expect(page.locator('#main')).toBeVisible();
    await expect(page.locator('#file-note')).toHaveText(
      `Saved 2 songs as ${name}. Send this file to the other group. They add the songs by pressing Restore from backup.`
    );

    await freshBrowser(page);
    await chooseFile(page, file, name);
    await expect(page.locator('#songs-file-title')).toHaveText('Add shared songs');
    await expect(page.locator('#restore-summary')).toHaveText('1 new song, 1 song you already have.');
    await expect(page.locator('#restore-existing-text')).toHaveText('It’s exactly the same as yours, so it will be left as it is.');
    await button(page, 'Add songs').click();
    await expect(page.locator('#file-note')).toHaveText('Done. We added 1 song.');
    await expect(page.locator('.song')).toHaveCount(9);
    await songButton(page, 'Our Song').click();
    await expect(tile(page, 0).locator('.tile-text')).toHaveText('Our words');
  });

  test('a shared song you already have can be kept as a second copy', async ({ page }) => {
    await openControl(page);
    await chooseFile(page, fileWith([song('x', 'Amazing Grace', 'Different words')], { kind: 'shared' }));
    const conflict = page.locator('.conflict');
    await expect(conflict.getByRole('button', { name: 'Use the shared one' })).toHaveAttribute('aria-pressed', 'true');
    await conflict.getByRole('button', { name: 'Keep both' }).click();
    await button(page, 'Add songs').click();
    await expect(page.locator('.song')).toHaveCount(9);
    await expect(songButton(page, 'Amazing Grace (shared)')).toHaveCount(1);
  });

  test('asks the browser to keep the songs once they change', async ({ page }) => {
    await page.addInitScript(() => {
      window.persistCalls = 0;
      Object.defineProperty(navigator, 'storage', {
        value: {
          persisted: async () => false,
          persist: async () => ++window.persistCalls > 0,
          estimate: async () => ({}),
        },
      });
    });
    await openControl(page);
    expect(await page.evaluate(() => window.persistCalls)).toBe(0);
    await addSong(page, 'Our Song', 'Words');
    await expect.poll(() => page.evaluate(() => window.persistCalls)).toBe(1);
  });

  test('a gentle reminder appears a week after changes with no backup, and can be put away', async ({ page }) => {
    const reminder = page.locator('#reminder');
    const stored = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), REMINDER_KEY);
    const setStored = (value) => page.evaluate(([key, v]) => localStorage.setItem(key, JSON.stringify(v)), [REMINDER_KEY, value]);

    await openControl(page);
    await expect(reminder).toBeHidden();
    expect(await stored()).toBeNull();

    await addSong(page, 'Our Song', 'Words');
    const { changedAt } = await stored();
    expect(Date.now() - changedAt).toBeLessThan(60_000);
    await page.reload();
    await expect(page.locator('.song')).toHaveCount(9);
    await expect(reminder).toBeHidden();

    await setStored({ changedAt: Date.now() - 8 * DAY });
    await page.reload();
    await expect(reminder).toBeVisible();
    await expect(reminder.locator('p')).toHaveText(
      'You’ve changed your songs but haven’t saved a backup for over a week. A backup file keeps them safe if this browser is ever cleared.'
    );
    await reminder.getByRole('button', { name: 'Not now' }).click();
    await expect(reminder).toBeHidden();
    await page.reload();
    await expect(page.locator('.song')).toHaveCount(9);
    await expect(reminder).toBeHidden();

    // It comes back a week after it was put away, until a backup is made.
    await setStored({ ...(await stored()), dismissedAt: Date.now() - 8 * DAY });
    await page.reload();
    await expect(reminder).toBeVisible();
    await saveFileFrom(page, reminder.getByRole('button', { name: 'Back up my songs' }));
    await expect(reminder).toBeHidden();
    expect((await stored()).changedAt).toBeUndefined();
    await page.reload();
    await expect(page.locator('.song')).toHaveCount(9);
    await expect(reminder).toBeHidden();

    // Songs added before backups existed count as changes not yet backed up.
    await page.evaluate((key) => localStorage.removeItem(key), REMINDER_KEY);
    await page.reload();
    await expect.poll(async () => (await stored())?.changedAt).toBeGreaterThan(0);
  });

  test('restore and share work at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openControl(page);
    const noSideScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    await button(page, 'Share songs').click();
    expect(await noSideScroll()).toBe(true);
    await button(page, 'Cancel').click();
    await chooseFile(page, fileWith([song('d', 'Amazing Grace', 'Backup words'), song('e', 'Be Thou My Vision', 'X')]));
    await expect(page.locator('#restore-all')).toBeVisible();
    expect(await noSideScroll()).toBe(true);
    for (const id of ['#previous', '#next', '#black', '#clear']) await expect(page.locator(id)).toBeInViewport();
    await button(page, 'Restore songs').scrollIntoViewIfNeeded();
    await expect(button(page, 'Restore songs')).toBeInViewport();
  });
});

test.describe('Phase 5: small fixes', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const REMINDER_KEY = 'worship-presenter:backup';

  test('on a phone, Keep your songs safe sits below the slides', async ({ page }) => {
    await openControl(page);
    // Wide screens: under the song list.
    expect(await page.locator('#keep-safe').evaluate((el) => el.parentElement.id)).toBe('songs-tab');

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.locator('#keep-safe').evaluate((el) => el.previousElementSibling?.className)).toBe('slides-panel');
    const slides = await page.locator('#slides').boundingBox();
    const safe = await page.locator('#keep-safe').boundingBox();
    expect(safe.y).toBeGreaterThan(slides.y + slides.height - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect.poll(() => page.locator('#keep-safe').evaluate((el) => el.parentElement.id)).toBe('songs-tab');
  });

  test('the backup reminder only shows while nothing is on the TV', async ({ page }) => {
    const reminder = page.locator('#reminder');
    await openControl(page);
    await page.evaluate(([key, v]) => localStorage.setItem(key, JSON.stringify(v)), [REMINDER_KEY, { changedAt: Date.now() - 8 * DAY }]);
    await page.reload();
    await expect(page.locator('.song')).toHaveCount(8);
    await expect(reminder).toBeVisible();

    await tile(page, 0).click();
    await expect(reminder).toBeHidden();
    await page.reload();
    await expect(page.locator('.song')).toHaveCount(8);
    await expectLiveTile(page, 0);
    await expect(reminder).toBeHidden();
  });
});

test.describe('Phase 5: Bible verses', () => {
  const button = (page, name) => page.getByRole('button', { name, exact: true });
  const tvCaption = (tv) => tv.locator('#caption');
  const tileText = (page, i) => tile(page, i).locator('.tile-text');

  // Types a reference on the Bible tab and shows it. Picking a translation
  // shows the typed reference straight away; otherwise Enter does.
  async function showPassage(page, reference, title, translation) {
    await page.locator('#tab-bible').click();
    await page.locator('#bible-ref').fill(reference);
    if (translation) await page.locator(`.translation[data-id="${translation}"]`).click();
    else await page.locator('#bible-ref').press('Enter');
    await expect(page.locator('#song-title')).toHaveText(title);
  }

  test('references are read the way people type them', async ({ page }) => {
    await openControl(page);
    const results = await page.evaluate(async () => {
      const { parseReference, formatReference } = await import('/js/bible-reference.js');
      const typed = [
        'John 3:16-18', 'jn 3 16', 'Ps 23', 'psalm 23:1-6', '1 Cor 13:4-7', 'I Corinthians 13', '1st cor 13',
        'Jhon 3:16', 'Revelations 21:4', 'Song of Songs 2', 'Jude 3', 'John 3:16–4:2', 'phil 4:13', 'Mathew 5:3-12',
        'Phillipians 4:6-7', '1 ch 16', 'Ps. 23', 'John chapter 3 verse 16', 'Isaiah 40:28 to 31', 'Ps 23-24',
        '', 'Jhonn 3', 'Ju 3', 'John 3:16, 18', 'Peter 1:3', 'John 3:18-16', 'Rev',
      ];
      return Object.fromEntries(
        typed.map((t) => {
          const r = parseReference(t);
          return [t, r.ok ? formatReference(r.ref) : `! ${r.message}`];
        })
      );
    });
    expect(results).toEqual({
      'John 3:16-18': 'John 3:16–18',
      'jn 3 16': 'John 3:16',
      'Ps 23': 'Psalm 23',
      'psalm 23:1-6': 'Psalm 23:1–6',
      '1 Cor 13:4-7': '1 Corinthians 13:4–7',
      'I Corinthians 13': '1 Corinthians 13',
      '1st cor 13': '1 Corinthians 13',
      'Jhon 3:16': 'John 3:16',
      'Revelations 21:4': 'Revelation 21:4',
      'Song of Songs 2': 'Song of Solomon 2',
      'Jude 3': 'Jude 3',
      'John 3:16–4:2': 'John 3:16–4:2',
      'phil 4:13': 'Philippians 4:13',
      'Mathew 5:3-12': 'Matthew 5:3–12',
      'Phillipians 4:6-7': 'Philippians 4:6–7',
      '1 ch 16': '1 Chronicles 16',
      'Ps. 23': 'Psalm 23',
      'John chapter 3 verse 16': 'John 3:16',
      'Isaiah 40:28 to 31': 'Isaiah 40:28–31',
      'Ps 23-24': 'Psalms 23–24',
      '': '! Type a Bible reference, like John 3:16.',
      'Jhonn 3': '! We couldn’t find a book called ‘Jhonn’. Try one like John 3:16.',
      'Ju 3': '! Did you mean Judges or Jude?',
      'John 3:16, 18': '! Lists of verses aren’t supported yet. Show one range at a time, like John 3:16-18.',
      'Peter 1:3': '! Did you mean 1 Peter or 2 Peter?',
      'John 3:18-16': '! The second number should come after the first, like John 3:16-18.',
      'Rev': '! Which chapter of Revelation? For example, Revelation 1.',
    });
  });

  test('each Bible loads only when it is first needed', async ({ page }) => {
    const loaded = [];
    page.on('request', (request) => {
      if (request.url().includes('/data/')) loaded.push(new URL(request.url()).pathname);
    });
    await openControl(page);
    await page.locator('#tab-bible').click();
    await expect(page.locator('.translation')).toHaveText(['KJV King James Version', 'WEB World English Bible']);
    expect(loaded).toEqual([]);

    await showPassage(page, 'John 3:16-18', 'John 3:16–18 (KJV)');
    expect(loaded).toEqual(['/data/kjv.json']);
    await showPassage(page, 'Ps 23', 'Psalm 23 (KJV)');
    expect(loaded).toEqual(['/data/kjv.json']);
    await showPassage(page, 'Ps 23', 'Psalm 23 (WEB)', 'web');
    expect(loaded).toEqual(['/data/kjv.json', '/data/web.json']);
  });

  test('a passage shows as one slide per verse, with the reference at the bottom of the TV', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await showPassage(page, 'John 3:16-18', 'John 3:16–18 (KJV)');
    await expect(page.locator('.tile-label')).toHaveText(['Verse 16', 'Verse 17', 'Verse 18']);
    await expect(tileText(page, 0)).toHaveText(/^For God so loved the world, that he gave his only begotten Son/);
    await expect(tile(page, 0).locator('.tile-ref')).toHaveText('John 3:16 · KJV');
    await expect(page.locator('#edit-song')).toBeHidden();

    await tile(page, 0).click();
    await expect(tvText(tv)).toHaveText(/^For God so loved the world, that he gave his only begotten Son/);
    await expect(tvCaption(tv)).toHaveText('John 3:16 · KJV');
    await expect(tvCaption(tv)).toBeVisible();
    await expect(page.locator('#live-note')).toHaveText('The TV is showing John 3:16–18 (KJV), Verse 16 (slide 1 of 3).');

    // Looking at the same passage in the WEB doesn't change the TV.
    await page.locator('.translation[data-id="web"]').click();
    await expect(page.locator('#song-title')).toHaveText('John 3:16–18 (WEB)');
    await expect(tileText(page, 0)).toHaveText(/^For God so loved the world, that he gave his only born Son/);
    await expect(tvCaption(tv)).toHaveText('John 3:16 · KJV');
    await expect(page.locator('#passages .song')).toHaveCount(2);

    // A song has no caption.
    await page.locator('#tab-songs').click();
    await songButton(page, 'Amazing Grace').click();
    await tile(page, 0).click();
    await expect(tvText(tv)).toHaveText(/^Amazing grace/);
    await expect(tvCaption(tv)).toHaveText('');
    await expect(tvCaption(tv)).toBeHidden();
  });

  test('Psalm titles are not part of verse 1 in either translation', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    const expected = {
      kjv: {
        'Psalm 23:1': 'The LORD is my shepherd; I shall not want.',
        'Psalm 51:1':
          'Have mercy upon me, O God, according to thy lovingkindness: according unto the multitude of thy tender mercies blot out my transgressions.',
      },
      web: {
        'Psalm 23:1': 'The LORD is my shepherd; I shall lack nothing.',
        'Psalm 51:1':
          'Have mercy on me, God, according to your loving kindness. According to the multitude of your tender mercies, blot out my transgressions.',
      },
    };
    for (const [translation, verses] of Object.entries(expected)) {
      for (const [reference, words] of Object.entries(verses)) {
        await showPassage(page, reference, `${reference} (${translation.toUpperCase()})`, translation);
        await expect(page.locator('.tile')).toHaveCount(1);
        await expect(tileText(page, 0)).toHaveText(words);
        await tile(page, 0).click();
        await expect(tvText(tv)).toHaveText(words);
        await expect(tvCaption(tv)).toHaveText(`${reference} · ${translation.toUpperCase()}`);
      }
    }
  });

  test('problems with a reference are explained in plain words', async ({ page }) => {
    await openControl(page);
    const error = page.locator('#bible-error');
    await page.locator('#tab-bible').click();
    await button(page, 'Show verses').click();
    await expect(error).toHaveText('Type a Bible reference, like John 3:16.');
    await page.locator('#bible-ref').fill('John 22');
    await page.locator('#bible-ref').press('Enter');
    await expect(error).toHaveText('John has 21 chapters.');
    await page.locator('#bible-ref').fill('Psalm 23:7');
    await page.locator('#bible-ref').press('Enter');
    await expect(error).toHaveText('Psalm 23 has 6 verses.');
    await page.locator('#bible-ref').fill('Jhonn 3');
    await expect(error).toBeHidden();
    await page.locator('#bible-ref').press('Enter');
    await expect(error).toHaveText('We couldn’t find a book called ‘Jhonn’. Try one like John 3:16.');
    await expect(page.locator('#bible-ref')).toHaveAttribute('aria-invalid', 'true');
    // Nothing was shown, and typing never moved the TV.
    await expect(page.locator('#passages .song')).toHaveCount(0);
    await expect(page.locator('#live-note')).toHaveText('Nothing is on the TV yet. Pick a slide.');
  });

  test('two short verses can share a slide, and the TV keeps its verse when this changes', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await showPassage(page, 'Ps 23', 'Psalm 23 (KJV)');
    await expect(page.locator('.tile')).toHaveCount(6);
    await tile(page, 2).click();
    await expect(tvText(tv)).toHaveText(/^He restoreth my soul/);

    await page.locator('#bible-two').check();
    await expect(page.locator('.tile-label')).toHaveText(['Verses 1–2', 'Verse 3', 'Verse 4', 'Verse 5', 'Verse 6']);
    await expect(tile(page, 0).locator('.tile-ref')).toHaveText('Psalm 23:1–2 · KJV');
    await expectLiveTile(page, 1);
    await expect(tvText(tv)).toHaveText(/^He restoreth my soul/);

    await tile(page, 0).click();
    await expect(tvText(tv)).toHaveText('The LORD is my shepherd; I shall not want.\nHe maketh me to lie down in green pastures: he leadeth me beside the still waters.');
    await expect(tvCaption(tv)).toHaveText('Psalm 23:1–2 · KJV');

    // The choice is remembered.
    await page.reload();
    await expect(page.locator('#songs .song')).toHaveCount(8);
    await expect(page.locator('#bible-two')).toBeChecked();
    await expect(page.locator('.tile')).toHaveCount(5);
    await page.locator('#bible-two').uncheck();
    await expect(page.locator('.tile')).toHaveCount(6);
    await expectLiveTile(page, 0);
  });

  test('a long verse is split across slides instead of getting tiny', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await tv.setViewportSize({ width: 800, height: 600 });
    for (const translation of ['kjv', 'web']) {
      await showPassage(page, 'Esther 8:9', `Esther 8:9 (${translation.toUpperCase()})`, translation);
      await expect(page.locator('.tile-label')).toHaveText(['Verse 9 (part 1 of 3)', 'Verse 9 (part 2 of 3)', 'Verse 9 (part 3 of 3)']);
      const texts = await page.locator('.tile-text').allTextContents();
      for (const text of texts) expect(text.length).toBeLessThanOrEqual(200);
      expect(texts.join(' ')).toMatch(/^Then .* their language\.$/);

      for (let i = 0; i < 3; i += 1) {
        await tile(page, i).click();
        await expect(tvText(tv)).toHaveText(texts[i]);
        await expect(tvCaption(tv)).toHaveText(`Esther 8:9 · ${translation.toUpperCase()}`);
        const fit = await tv.evaluate(async () => {
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const text = document.getElementById('text');
          const caption = document.getElementById('caption').getBoundingClientRect();
          const box = text.getBoundingClientRect();
          return {
            size: parseFloat(getComputedStyle(text).fontSize),
            clear: box.bottom <= caption.top,
            fits: text.scrollWidth <= text.clientWidth,
          };
        });
        expect(fit.size, `part ${i + 1}`).toBeGreaterThanOrEqual(28);
        expect(fit.clear, 'the words stay above the reference').toBe(true);
        expect(fit.fits).toBe(true);
      }
    }
  });

  test('a passage works like a song for Next, Previous and the On the TV marks', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    // A song's last slide is on the TV, and a passage is being viewed.
    await tile(page, 4).click();
    await showPassage(page, 'John 3:16-18', 'John 3:16–18 (KJV)');
    await expect(page.locator('#elsewhere')).toBeVisible();
    await expect(page.locator('#tab-songs .tab-live')).toBeVisible();

    // Next finishes the song, then starts the passage.
    await page.keyboard.press('ArrowRight');
    await expectLiveTile(page, 0);
    await expect(tvText(tv)).toHaveText(/^For God so loved/);
    await expect(tvCaption(tv)).toHaveText('John 3:16 · KJV');
    await expect(page.locator('#elsewhere')).toBeHidden();
    await expect(page.locator('#tab-songs .tab-live')).toBeHidden();
    await expect(page.locator('#passages .song').first()).toHaveClass(/is-live/);

    // Previous never leaves it; Next stops at its end.
    await page.keyboard.press('ArrowLeft');
    await expectLiveTile(page, 0);
    await page.keyboard.press(' ');
    await page.keyboard.press('PageDown');
    await page.keyboard.press('ArrowRight');
    await expectLiveTile(page, 2);
    await expect(tvCaption(tv)).toHaveText('John 3:18 · KJV');

    // Looking at a song: the TV stays on the passage, and both tabs say so.
    await page.locator('#tab-songs').click();
    await expect(page.locator('#tab-bible .tab-live')).toBeVisible();
    await songButton(page, 'Rock of Ages').click();
    await expect(page.locator('#elsewhere-text')).toHaveText(
      'The TV is showing John 3:16–18 (KJV), Verse 18. Next keeps going through that passage, then starts this one.'
    );
    await page.keyboard.press('ArrowLeft');
    await expect(tvCaption(tv)).toHaveText('John 3:17 · KJV');
    await expect(page.locator('#live-note')).toHaveText('The TV is showing John 3:16–18 (KJV), Verse 17 (slide 2 of 3).');

    // Go to that passage brings back the Bible tab and its slides.
    await button(page, 'Go to that passage').click();
    await expect(page.locator('#bible-tab')).toBeVisible();
    await expect(page.locator('#tab-bible')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#song-title')).toHaveText('John 3:16–18 (KJV)');
    await expectLiveTile(page, 1);
    await expect(page.locator('#keep-safe')).toBeHidden();

    // Next to the end of the passage, then on into the song being viewed.
    await page.locator('#tab-songs').click();
    await songButton(page, 'Rock of Ages').click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(tvText(tv)).toHaveText(/^Rock of Ages, cleft for me/);
    await expect(tvCaption(tv)).toHaveText('');
    await expect(songButton(page, 'Rock of Ages')).toHaveClass(/is-live/);
  });

  test('Black screen and Clear text hide the reference too', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await showPassage(page, 'Rom 8:28', 'Romans 8:28 (KJV)');
    await tile(page, 0).click();
    await expect(tvCaption(tv)).toBeVisible();

    await page.keyboard.press('b');
    await expect(tv.locator('body')).toHaveClass(/black/);
    await expect(tvCaption(tv)).toBeHidden();
    await expect(tile(page, 0).locator('.tile-live')).toHaveText('Black screen');
    await page.keyboard.press('b');
    await expect(tvCaption(tv)).toBeVisible();

    await page.locator('#clear').click();
    await expect(tvText(tv)).toHaveText('');
    await expect(tvCaption(tv)).toHaveText('');
    await expect(tile(page, 0).locator('.tile-live')).toHaveText('Text cleared');
    await tile(page, 0).click();
    await expect(tvCaption(tv)).toHaveText('Romans 8:28 · KJV');
  });

  test('a reload keeps the passage on the TV, the one being viewed and the open tab', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await showPassage(page, '1 Cor 13:4-7', '1 Corinthians 13:4–7 (KJV)');
    await tile(page, 1).click();
    await showPassage(page, 'Ps 121', 'Psalm 121 (WEB)', 'web');

    await page.reload();
    await expect(page.locator('#song-title')).toHaveText('Psalm 121 (WEB)');
    await expect(page.locator('#bible-tab')).toBeVisible();
    await expect(page.locator('#passages .song-name')).toHaveText(['Psalm 121 WEB', '1 Corinthians 13:4–7 KJV']);
    await expect(page.locator('#passages .song').nth(0)).not.toHaveClass(/is-live/);
    await expect(page.locator('#passages .song').nth(1)).toHaveClass(/is-live/);
    await expect(page.locator('#live-note')).toHaveText('The TV is showing 1 Corinthians 13:4–7 (KJV), Verse 5 (slide 2 of 4).');
    await expect(page.locator('#display-status')).toHaveText('TV window is open');
    await expect(tvCaption(tv)).toHaveText('1 Corinthians 13:5 · KJV');

    // Next goes on through the passage on the TV.
    await page.keyboard.press('ArrowRight');
    await expect(tvCaption(tv)).toHaveText('1 Corinthians 13:6 · KJV');

    // A passage from the list loads when picked.
    await page.locator('#passages .song', { hasText: '1 Corinthians' }).click();
    await expectLiveTile(page, 2);

    // A reloaded TV catches up, reference and all.
    await tv.reload();
    await expect(tvText(tv)).toHaveText(/^Rejoiceth not in iniquity/);
    await expect(tvCaption(tv)).toHaveText('1 Corinthians 13:6 · KJV');
  });

  test('the Bible tab works at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openControl(page);
    await showPassage(page, 'John 3:16-18', 'John 3:16–18 (KJV)');
    await expect(page.locator('#song-title')).toBeInViewport();
    await expect(page.locator('#keep-safe')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const id of ['#previous', '#next', '#black', '#clear']) await expect(page.locator(id)).toBeInViewport();
    await page.locator('#tab-songs').click();
    await expect(page.locator('#keep-safe')).toBeVisible();
  });
});

test.describe('Phase 6: service order', () => {
  const fs = require('fs');
  const button = (page, name) => page.getByRole('button', { name, exact: true });
  const rows = (page) => page.locator('.service-item');
  const row = (page, i) => rows(page).nth(i);
  const rowTitles = (page) => page.locator('.service-item .service-title').allTextContents();
  const nextLine = (page) => page.locator('#service-next');
  const tvCaption = (tv) => tv.locator('#caption');

  async function addSong(page, title) {
    await page.locator('#tab-songs').click();
    await songButton(page, title).click();
    await expect(page.locator('#song-title')).toHaveText(title);
    await page.locator('#add-to-service').click();
  }

  async function addPassage(page, reference, title) {
    await page.locator('#tab-bible').click();
    await page.locator('#bible-ref').fill(reference);
    await page.locator('#bible-ref').press('Enter');
    await expect(page.locator('#song-title')).toHaveText(title);
    await page.locator('#add-to-service').click();
  }

  async function openService(page) {
    await page.locator('#tab-service').click();
    await expect(page.locator('#service-tab')).toBeVisible();
  }

  // Opens a row's slides and puts its first slide on the TV.
  async function startRow(page, i, title) {
    await row(page, i).locator('.service-open').click();
    await expect(page.locator('#song-title')).toHaveText(title);
    await tile(page, 0).click();
    await expectLiveTile(page, 0);
  }

  async function pressNext(page, times = 1) {
    for (let i = 0; i < times; i += 1) await page.keyboard.press('ArrowRight');
  }

  // Come, Thou Fount (3 slides), John 3:16–17 (2 slides), What a Friend (3 slides).
  async function buildService(page) {
    await addSong(page, 'Come, Thou Fount of Every Blessing');
    await addPassage(page, 'John 3:16-17', 'John 3:16–17 (KJV)');
    await addSong(page, 'What a Friend We Have in Jesus');
    await openService(page);
    await expect(rows(page)).toHaveCount(3);
  }

  async function saveFileFrom(page, locator) {
    const [download] = await Promise.all([page.waitForEvent('download'), locator.click()]);
    return { name: download.suggestedFilename(), file: JSON.parse(fs.readFileSync(await download.path(), 'utf8')) };
  }

  async function chooseFile(page, contents) {
    await page.locator('#restore-file').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(contents)),
    });
    await expect(page.locator('#songs-file')).toBeVisible();
  }

  async function freshBrowser(page) {
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          localStorage.clear();
          sessionStorage.clear();
          indexedDB.deleteDatabase('worship-presenter').onsuccess = resolve;
        })
    );
    await page.reload();
    await expect(page.locator('.song')).toHaveCount(8);
  }

  const storedServices = (page) =>
    page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open('worship-presenter');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const request = open.result.transaction('services').objectStore('services').getAll();
            request.onsuccess = () => {
              resolve(request.result);
              open.result.close();
            };
          };
        })
    );

  test('songs and passages are added from their tabs, and the first one makes a service for today', async ({ page }) => {
    await openControl(page);
    await openService(page);
    await expect(page.locator('#service-empty')).toHaveText(/No service yet/);
    await expect(button(page, 'Rename')).toBeHidden();

    await addSong(page, 'Amazing Grace');
    await expect(page.locator('#added-note')).toHaveText('Added to Meeting. It has 1 item.');
    await addPassage(page, 'Ps 23', 'Psalm 23 (KJV)');
    await expect(page.locator('#added-note')).toHaveText('Added to Meeting. It has 2 items.');
    await addSong(page, 'Rock of Ages');

    await openService(page);
    expect(await rowTitles(page)).toEqual(['Amazing Grace', 'Psalm 23', 'Rock of Ages']);
    await expect(row(page, 1).locator('.song-detail')).toHaveText('KJV');
    await expect(page.locator('#service-name')).toHaveText('Meeting');
    const date = await page.evaluate(() =>
      new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
    );
    await expect(page.locator('#service-date')).toHaveText(`${date} · 3 items`);
    // Only references are stored: no words.
    const [stored] = await storedServices(page);
    expect(stored.items.map((item) => item.type)).toEqual(['song', 'passage', 'song']);
    expect(JSON.stringify(stored)).not.toContain('Amazing grace! How sweet');
    expect(stored.items[1]).toMatchObject({ translation: 'kjv', ref: { book: 18, startChapter: 23 } });

    // Opening an item shows its slides on the Service tab.
    await row(page, 1).locator('.service-open').click();
    await expect(page.locator('#song-title')).toHaveText('Psalm 23 (KJV)');
    await expect(page.locator('#service-tab')).toBeVisible();
    await expect(row(page, 1).locator('.service-open')).toHaveAttribute('aria-current', 'true');
  });

  test('items are moved by dragging or with Up and Down, and removed', async ({ page }) => {
    await openControl(page);
    await buildService(page);
    await rows(page).nth(0).dragTo(rows(page).nth(2));
    expect(await rowTitles(page)).toEqual(['John 3:16–17', 'What a Friend We Have in Jesus', 'Come, Thou Fount of Every Blessing']);
    await rows(page).nth(2).dragTo(rows(page).nth(0));
    expect(await rowTitles(page)).toEqual(['Come, Thou Fount of Every Blessing', 'John 3:16–17', 'What a Friend We Have in Jesus']);

    await expect(row(page, 0).getByRole('button', { name: 'Move Come, Thou Fount of Every Blessing up' })).toBeDisabled();
    await row(page, 0).getByRole('button', { name: 'Move Come, Thou Fount of Every Blessing down' }).click();
    expect(await rowTitles(page)).toEqual(['John 3:16–17', 'Come, Thou Fount of Every Blessing', 'What a Friend We Have in Jesus']);
    // The keyboard stays on the item that moved.
    expect(await page.evaluate(() => document.activeElement.getAttribute('aria-label'))).toBe(
      'Move Come, Thou Fount of Every Blessing down'
    );
    await row(page, 2).getByRole('button', { name: 'Move What a Friend We Have in Jesus up' }).click();
    expect(await rowTitles(page)).toEqual(['John 3:16–17', 'What a Friend We Have in Jesus', 'Come, Thou Fount of Every Blessing']);

    await row(page, 0).getByRole('button', { name: 'Remove John 3:16–17 from the service' }).click();
    expect(await rowTitles(page)).toEqual(['What a Friend We Have in Jesus', 'Come, Thou Fount of Every Blessing']);
    await expect(page.locator('#service-date')).toHaveText(/2 items$/);

    // The new order is kept.
    await page.reload();
    await openService(page);
    expect(await rowTitles(page)).toEqual(['What a Friend We Have in Jesus', 'Come, Thou Fount of Every Blessing']);
  });

  test('Next goes through the whole service, from the last slide of one item to the first of the next', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await buildService(page);
    await expect(nextLine(page)).toBeHidden();

    await startRow(page, 0, 'Come, Thou Fount of Every Blessing');
    await expect(row(page, 0).locator('.service-mark')).toHaveText('On the TV');
    await expect(row(page, 1).locator('.service-mark')).toHaveText('Next');
    await expect(nextLine(page)).toHaveText('Next in the service: John 3:16–17 (KJV)');
    await expect(page.locator('#tab-service .tab-live')).toBeHidden();

    await pressNext(page, 2);
    await expectLiveTile(page, 2);
    // Over into the passage. This page follows along, because it was showing the TV.
    await pressNext(page);
    await expect(tvText(tv)).toHaveText(/^For God so loved/);
    await expect(tvCaption(tv)).toHaveText('John 3:16 · KJV');
    await expect(page.locator('#song-title')).toHaveText('John 3:16–17 (KJV)');
    await expectLiveTile(page, 0);
    await expect(row(page, 1).locator('.service-mark')).toHaveText('On the TV');
    await expect(nextLine(page)).toHaveText('Next in the service: What a Friend We Have in Jesus');
    await expect(page.locator('#live-note')).toHaveText('The TV is showing John 3:16–17 (KJV), Verse 16 (slide 1 of 2).');

    await page.locator('#next').click();
    await page.locator('#next').click();
    await expect(tvText(tv)).toHaveText(/^What a friend we have in Jesus/);
    await expect(tvCaption(tv)).toHaveText('');
    await expect(nextLine(page)).toHaveText('That’s the end of the service.');

    // Previous stays within the item on the TV.
    await page.keyboard.press('ArrowLeft');
    await expect(tvText(tv)).toHaveText(/^What a friend we have in Jesus/);

    // At the very end, Next stays on the last slide.
    await pressNext(page, 3);
    await expectLiveTile(page, 2);
    await expect(row(page, 2).locator('.service-mark')).toHaveText('On the TV');

    // On another tab, the Service tab shows it has what's on the TV.
    await page.locator('#tab-songs').click();
    await expect(page.locator('#tab-service .tab-live')).toBeVisible();
    await expect(page.locator('#tab-songs .tab-live')).toBeHidden();
  });

  test('looking at a later item doesn’t change the TV; Next keeps to the order, and a click shows it at once', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await buildService(page);
    await startRow(page, 0, 'Come, Thou Fount of Every Blessing');

    await row(page, 2).locator('.service-open').click();
    await expect(page.locator('#song-title')).toHaveText('What a Friend We Have in Jesus');
    await expect(tvText(tv)).toHaveText(/^Come, Thou Fount/);
    await expect(page.locator('#elsewhere-text')).toHaveText(
      'The TV is showing Come, Thou Fount of Every Blessing, Verse 1. ' +
        'Next keeps going through that song, then goes on to John 3:16–17 (KJV), next in the service.'
    );

    await pressNext(page, 3);
    await expect(tvText(tv)).toHaveText(/^For God so loved/);
    // Still looking at What a Friend: the page doesn't jump away from it.
    await expect(page.locator('#song-title')).toHaveText('What a Friend We Have in Jesus');
    await expect(page.locator('#elsewhere-text')).toHaveText(
      'The TV is showing John 3:16–17 (KJV), Verse 16. Next keeps going through that passage, then starts this one.'
    );

    await tile(page, 1).click();
    await expect(tvText(tv)).toHaveText(/^Have we trials and temptations/);
    await expect(row(page, 2).locator('.service-mark')).toHaveText('On the TV');
    await expect(nextLine(page)).toHaveText('That’s the end of the service.');

    await expect(page.locator('#elsewhere')).toBeHidden();
  });

  test('a song picked from the Songs tab is sung after the current item, then the service carries on', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await buildService(page);
    await startRow(page, 0, 'Come, Thou Fount of Every Blessing');

    await page.locator('#tab-songs').click();
    await songButton(page, 'Rock of Ages').click();
    await expect(page.locator('#elsewhere-text')).toHaveText(/then starts this one\.$/);
    await pressNext(page, 3);
    await expect(tvText(tv)).toHaveText(/^Rock of Ages, cleft for me/);
    // It came from the Songs tab, so the Service tab isn't marked.
    await expect(songButton(page, 'Rock of Ages')).toHaveClass(/is-live/);
    await expect(page.locator('#tab-service .tab-live')).toBeHidden();
    await expect(nextLine(page)).toHaveText('Next in the service: John 3:16–17 (KJV)');

    await pressNext(page, 4);
    await expect(tvText(tv)).toHaveText(/^For God so loved/);
    await openService(page);
    await expect(row(page, 1).locator('.service-mark')).toHaveText('On the TV');
  });

  test('the same song can be in a service twice, and the right one is marked', async ({ page }) => {
    await openControl(page);
    await addSong(page, 'Amazing Grace');
    await addSong(page, 'Rock of Ages');
    await addSong(page, 'Amazing Grace');
    await openService(page);
    await startRow(page, 2, 'Amazing Grace');
    await expect(row(page, 2).locator('.service-mark')).toHaveText('On the TV');
    await expect(row(page, 0).locator('.service-mark')).toBeHidden();
    await expect(nextLine(page)).toHaveText('That’s the end of the service.');

    await startRow(page, 0, 'Amazing Grace');
    await expect(row(page, 0).locator('.service-mark')).toHaveText('On the TV');
    await expect(row(page, 2).locator('.service-mark')).toBeHidden();
    await pressNext(page, 5);
    await expect(row(page, 1).locator('.service-mark')).toHaveText('On the TV');
    await pressNext(page, 4);
    await expect(row(page, 2).locator('.service-mark')).toHaveText('On the TV');
  });

  test('services can be made, renamed, duplicated, deleted and switched, and are kept', async ({ page }) => {
    await openControl(page);
    await addSong(page, 'Amazing Grace');
    await openService(page);

    await button(page, 'Rename').click();
    await expect(page.locator('#service-name-input')).toBeFocused();
    await page.locator('#service-name-input').fill('');
    await button(page, 'Save service').click();
    await expect(page.locator('#service-name-error')).toHaveText(/Give the service a name/);
    await page.locator('#service-name-input').fill('Friday meeting');
    await page.locator('#service-date-input').fill('2026-10-23');
    await button(page, 'Save service').click();
    await expect(page.locator('#service-name')).toHaveText('Friday meeting');
    await expect(page.locator('#service-date')).toHaveText(/1 item$/);
    await expect(page.locator('#service-date')).toHaveText(/23/);

    await button(page, 'Duplicate').click();
    await expect(page.locator('#service-name')).toHaveText('Friday meeting (copy)');
    expect(await rowTitles(page)).toEqual(['Amazing Grace']);
    await expect(page.locator('.other-service')).toHaveCount(1);

    // A new, empty service.
    await button(page, '+ New service').click();
    await page.locator('#service-name-input').fill('Prayer night');
    await page.locator('#service-date-input').fill('2026-11-06');
    await button(page, 'Save service').click();
    await expect(page.locator('#service-name')).toHaveText('Prayer night');
    await expect(rows(page)).toHaveCount(0);
    await expect(page.locator('#service-empty')).toHaveText(/This service is empty/);
    // Newest date first.
    await expect(page.locator('.other-service-name')).toHaveText(['Friday meeting', 'Friday meeting (copy)']);
    await addSong(page, 'Rock of Ages');

    // Cancel leaves things as they were.
    await openService(page);
    await button(page, '+ New service').click();
    await button(page, 'Cancel').click();
    await expect(page.locator('.other-service')).toHaveCount(2);

    // Delete asks first.
    await page.locator('.other-service', { hasText: 'Friday meeting (copy)' }).click();
    await expect(page.locator('#service-name')).toHaveText('Friday meeting (copy)');
    await button(page, 'Delete').click();
    await expect(page.locator('#service-confirm-text')).toHaveText(
      'Delete Friday meeting (copy)? The songs stay in your song list.'
    );
    await button(page, 'No, keep it').click();
    await expect(page.locator('#service-name')).toHaveText('Friday meeting (copy)');
    await button(page, 'Delete').click();
    await button(page, 'Yes, delete it').click();
    await expect(page.locator('#service-name')).toHaveText('Prayer night');
    await expect(page.locator('.other-service-name')).toHaveText(['Friday meeting']);
    await expect(page.locator('.song')).toHaveCount(8);

    // Everything is still there after closing and opening the page.
    await page.reload();
    await openService(page);
    await expect(page.locator('#service-name')).toHaveText('Prayer night');
    expect(await rowTitles(page)).toEqual(['Rock of Ages']);
    await page.locator('.other-service', { hasText: 'Friday meeting' }).click();
    expect(await rowTitles(page)).toEqual(['Amazing Grace']);
    expect((await storedServices(page)).map((s) => s.name).sort()).toEqual(['Friday meeting', 'Prayer night']);
  });

  test('a reload carries on from the same place in the service', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await buildService(page);
    await startRow(page, 0, 'Come, Thou Fount of Every Blessing');
    await pressNext(page, 3);
    await expect(tvText(tv)).toHaveText(/^For God so loved/);

    await page.reload();
    await expect(page.locator('#service-tab')).toBeVisible();
    await expect(page.locator('#song-title')).toHaveText('John 3:16–17 (KJV)');
    await expect(row(page, 1).locator('.service-mark')).toHaveText('On the TV');
    await expect(nextLine(page)).toHaveText('Next in the service: What a Friend We Have in Jesus');
    await expectLiveTile(page, 0);
    await pressNext(page, 2);
    await expect(tvText(tv)).toHaveText(/^What a friend we have in Jesus/);
  });

  test('a deleted song shows plainly, Next skips it, and it comes back if the song does', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await addSong(page, 'Come, Thou Fount of Every Blessing');
    await addSong(page, 'Rock of Ages');
    await addSong(page, 'What a Friend We Have in Jesus');

    await page.locator('#tab-songs').click();
    await songButton(page, 'Rock of Ages').click();
    await button(page, 'Edit song').click();
    await button(page, 'Delete song').click();
    await button(page, 'Yes, delete it').click();
    await expect(page.locator('#editor')).toBeHidden();

    await openService(page);
    await expect(row(page, 1).locator('.service-title')).toHaveText('Rock of Ages');
    await expect(row(page, 1).locator('.service-missing')).toHaveText(
      'This song isn’t in your songs any more. It will be skipped.'
    );
    await expect(row(page, 1).locator('.service-open')).toBeDisabled();

    await startRow(page, 0, 'Come, Thou Fount of Every Blessing');
    await expect(nextLine(page)).toHaveText('Next in the service: What a Friend We Have in Jesus');
    await pressNext(page, 3);
    await expect(tvText(tv)).toHaveText(/^What a friend we have in Jesus/);

    // Bring it back, and the row works again.
    await page.locator('#tab-songs').click();
    await button(page, 'Bring back deleted sample songs').click();
    await expect(page.locator('.song')).toHaveCount(8);
    await openService(page);
    await expect(row(page, 1).locator('.service-missing')).toBeHidden();
    await expect(row(page, 1).locator('.service-open')).toBeEnabled();
  });

  test('moving items while the service is running never changes the TV', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await buildService(page);
    await startRow(page, 1, 'John 3:16–17 (KJV)');
    await expect(tvText(tv)).toHaveText(/^For God so loved/);
    const sent = () => tv.evaluate(() => document.querySelector('#text').textContent);
    const before = await sent();

    // Move the item on the TV, by dragging and with the buttons.
    await rows(page).nth(1).dragTo(rows(page).nth(2));
    expect(await rowTitles(page)).toEqual(['Come, Thou Fount of Every Blessing', 'What a Friend We Have in Jesus', 'John 3:16–17']);
    await expect(row(page, 2).locator('.service-mark')).toHaveText('On the TV');
    await expect(nextLine(page)).toHaveText('That’s the end of the service.');
    await row(page, 2).getByRole('button', { name: 'Move John 3:16–17 up' }).click();
    await row(page, 1).getByRole('button', { name: 'Move John 3:16–17 up' }).click();
    expect(await rowTitles(page)).toEqual(['John 3:16–17', 'Come, Thou Fount of Every Blessing', 'What a Friend We Have in Jesus']);
    await expect(row(page, 0).locator('.service-mark')).toHaveText('On the TV');
    // Move another item around it.
    await row(page, 2).getByRole('button', { name: 'Move What a Friend We Have in Jesus up' }).click();
    await expect(nextLine(page)).toHaveText('Next in the service: What a Friend We Have in Jesus');

    expect(await sent()).toBe(before);
    await expect(tvCaption(tv)).toHaveText('John 3:16 · KJV');
    await expectLiveTile(page, 0);
    await expect(page.locator('#live-note')).toHaveText('The TV is showing John 3:16–17 (KJV), Verse 16 (slide 1 of 2).');

    // Next follows the new order.
    await pressNext(page, 2);
    await expect(tvText(tv)).toHaveText(/^What a friend we have in Jesus/);
    await pressNext(page, 3);
    await expect(tvText(tv)).toHaveText(/^Come, Thou Fount/);
  });

  test('removing the item on the TV leaves the TV alone, and Next goes on to the one after it', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await buildService(page);
    await startRow(page, 1, 'John 3:16–17 (KJV)');
    await tile(page, 1).click();
    await expect(tvText(tv)).toHaveText(/^For God sent not his Son/);

    await row(page, 1).getByRole('button', { name: 'Remove John 3:16–17 from the service' }).click();
    expect(await rowTitles(page)).toEqual(['Come, Thou Fount of Every Blessing', 'What a Friend We Have in Jesus']);
    await expect(tvText(tv)).toHaveText(/^For God sent not his Son/);
    await expect(tvCaption(tv)).toHaveText('John 3:17 · KJV');
    await expectLiveTile(page, 1);
    await expect(page.locator('#song-title')).toHaveText('John 3:16–17 (KJV)');
    await expect(row(page, 1).locator('.service-mark')).toHaveText('Next');
    await expect(nextLine(page)).toHaveText('Next in the service: What a Friend We Have in Jesus');

    await pressNext(page);
    await expect(tvText(tv)).toHaveText(/^What a friend we have in Jesus/);
    await expect(row(page, 1).locator('.service-mark')).toHaveText('On the TV');
  });

  test('removing the first item while it’s on the TV, with Black screen or Clear text on, changes nothing on the TV', async ({ page }) => {
    await openControl(page);
    const tv = await openDisplay(page);
    await buildService(page);
    await startRow(page, 0, 'Come, Thou Fount of Every Blessing');
    await pressNext(page, 2);
    await page.locator('#clear').click();
    await expect(tvText(tv)).toHaveText('');
    await page.keyboard.press('b');
    await expect(tv.locator('body')).toHaveClass(/black/);

    await row(page, 0).getByRole('button', { name: 'Remove Come, Thou Fount of Every Blessing from the service' }).click();
    await expect(tv.locator('body')).toHaveClass(/black/);
    await expect(tvText(tv)).toHaveText('');
    await expect(page.locator('#black')).toHaveAttribute('aria-pressed', 'true');
    await expect(row(page, 0).locator('.service-mark')).toHaveText('Next');

    await page.keyboard.press('b');
    await expect(tvText(tv)).toHaveText('');
    await expect(tile(page, 2)).toHaveClass(/is-hidden/);
    await pressNext(page);
    await expect(tvText(tv)).toHaveText(/^For God so loved/);
    await expect(row(page, 0).locator('.service-mark')).toHaveText('On the TV');
  });

  test('Back up my songs includes services, and restoring brings them back linked to the songs', async ({ page }) => {
    await openControl(page);
    await page.locator('#add-song').click();
    await page.locator('#editor-song-title').fill('Our Song');
    await page.locator('#editor-lyrics').fill('Line one\nLine two');
    await button(page, 'Save song').click();
    await expect(page.locator('#editor')).toBeHidden();
    await addSong(page, 'Our Song');
    await addPassage(page, 'Ps 23', 'Psalm 23 (KJV)');
    await addSong(page, 'Amazing Grace');

    await page.locator('#tab-songs').click();
    const { file } = await saveFileFrom(page, button(page, 'Back up my songs'));
    await expect(page.locator('#file-note')).toHaveText(/with 1 song you added or changed and 1 service\./);
    expect(file.services).toHaveLength(1);
    expect(file.services[0].items.map((item) => item.type)).toEqual(['song', 'passage', 'song']);
    const ourId = file.songs[0].id;

    // Another browser that already has "Our Song" under a different id.
    await freshBrowser(page);
    await page.locator('#add-song').click();
    await page.locator('#editor-song-title').fill('Our Song');
    await page.locator('#editor-lyrics').fill('Line one\nLine two');
    await button(page, 'Save song').click();
    await expect(page.locator('#editor')).toBeHidden();

    await chooseFile(page, file);
    await expect(page.locator('#restore-summary')).toHaveText('No new songs, 1 song you already have.');
    await expect(page.locator('#restore-services')).toBeVisible();
    await expect(page.locator('#restore-services-list li')).toHaveText(['Meeting']);
    await button(page, 'Restore songs').click();
    await expect(page.locator('#file-note')).toHaveText('Done. We added 1 service.');

    await openService(page);
    expect(await rowTitles(page)).toEqual(['Our Song', 'Psalm 23', 'Amazing Grace']);
    await expect(page.locator('.service-missing:visible')).toHaveCount(0);
    const [stored] = await storedServices(page);
    expect(stored.items[0].songId).not.toBe(ourId);

    // Restoring the same file again changes nothing.
    await page.locator('#tab-songs').click();
    await chooseFile(page, file);
    await expect(page.locator('#restore-services-text')).toHaveText('1 service is the same as yours and will be left alone.');
    await button(page, 'Restore songs').click();
    await expect(page.locator('#file-note')).toHaveText('Nothing needed to change. You already have these songs.');
    expect(await storedServices(page)).toHaveLength(1);

    // A different version of a service you have is added as a copy; yours stays.
    const changed = { ...file, services: [{ ...file.services[0], items: file.services[0].items.slice(1) }] };
    await chooseFile(page, changed);
    await expect(page.locator('#restore-services-text')).toHaveText(
      '1 service will be added. Open it from the Service tab. ' +
        'You already have a different version of one, so it’s added as a copy and yours isn’t changed.'
    );
    await expect(page.locator('#restore-services-list li')).toHaveText(['Meeting (from backup)']);
    await button(page, 'Restore songs').click();
    await openService(page);
    expect(await rowTitles(page)).toEqual(['Our Song', 'Psalm 23', 'Amazing Grace']);
    await page.locator('.other-service', { hasText: 'Meeting (from backup)' }).click();
    expect(await rowTitles(page)).toEqual(['Psalm 23', 'Amazing Grace']);
  });

  test('a service can be shared with its songs, and another group runs the same meeting', async ({ page }) => {
    await openControl(page);
    await page.locator('#add-song').click();
    await page.locator('#editor-song-title').fill('Group Song');
    await page.locator('#editor-lyrics').fill('First slide\n\nSecond slide');
    await button(page, 'Save song').click();
    await expect(page.locator('#editor')).toBeHidden();
    await addSong(page, 'Group Song');
    await addPassage(page, 'John 3:16-17', 'John 3:16–17 (KJV)');
    await addSong(page, 'Rock of Ages');
    await openService(page);
    await button(page, 'Rename').click();
    await page.locator('#service-name-input').fill('Friday meeting');
    await button(page, 'Save service').click();

    await page.locator('#tab-songs').click();
    await button(page, 'Share songs').click();
    await page.locator('#share-service-list label', { hasText: 'Friday meeting' }).click();
    await expect(page.locator('#share-list input:checked')).toHaveCount(2);
    const go = page.locator('#share-go');
    await expect(go).toHaveText('Save 2 songs and 1 service to a file');
    const { name, file } = await saveFileFrom(page, go);
    expect(name).toMatch(/^shared-songs-\d{4}-\d{2}-\d{2}\.json$/);
    expect(file.kind).toBe('shared');
    expect(file.songs.map((s) => s.title).sort()).toEqual(['Group Song', 'Rock of Ages']);
    expect(file.services.map((s) => s.name)).toEqual(['Friday meeting']);
    await expect(page.locator('#file-note')).toHaveText(
      `Saved 2 songs and 1 service as ${name}. Send this file to the other group. They add them by pressing Restore from backup.`
    );

    await freshBrowser(page);
    await chooseFile(page, file);
    await expect(page.locator('#songs-file-title')).toHaveText('Add shared songs');
    await expect(page.locator('#restore-services-list li')).toHaveText(['Friday meeting']);
    await button(page, 'Add songs').click();
    await expect(page.locator('#file-note')).toHaveText('Done. We added 1 song and 1 service.');

    const tv = await openDisplay(page);
    await openService(page);
    await expect(page.locator('#service-name')).toHaveText('Friday meeting');
    expect(await rowTitles(page)).toEqual(['Group Song', 'John 3:16–17', 'Rock of Ages']);
    await startRow(page, 0, 'Group Song');
    await pressNext(page, 2);
    await expect(tvText(tv)).toHaveText(/^For God so loved/);
    await pressNext(page, 2);
    await expect(tvText(tv)).toHaveText(/^Rock of Ages/);
  });

  test('a song library from before services keeps its songs and gains services', async ({ page }) => {
    await page.goto('/display.html');
    await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open('worship-presenter', 1);
          open.onupgradeneeded = () => open.result.createObjectStore('songs', { keyPath: 'id' });
          open.onsuccess = () => {
            const tx = open.result.transaction('songs', 'readwrite');
            tx.objectStore('songs').put({ id: 'old-song', title: 'An Old Song', sections: [{ name: 'Slide 1', text: 'Still here' }] });
            tx.oncomplete = () => {
              open.result.close();
              resolve();
            };
          };
          open.onerror = () => reject(open.error);
        })
    );
    await page.goto('/');
    await expect(page.locator('.song')).toHaveCount(9);
    await addSong(page, 'An Old Song');
    await page.reload();
    await openService(page);
    expect(await rowTitles(page)).toEqual(['An Old Song']);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('the Service tab works with Up and Down, and nothing scrolls sideways', async ({ page }) => {
      await openControl(page);
      await buildService(page);
      await expect(page.locator('.service-grip').first()).toBeHidden();
      await expect(page.locator('#keep-safe')).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      await row(page, 1).getByRole('button', { name: 'Move John 3:16–17 down' }).tap();
      expect(await rowTitles(page)).toEqual(['Come, Thou Fount of Every Blessing', 'What a Friend We Have in Jesus', 'John 3:16–17']);

      // Opening an item scrolls to its slides.
      await row(page, 2).locator('.service-open').tap();
      await expect(page.locator('#song-title')).toHaveText('John 3:16–17 (KJV)');
      await expect(page.locator('#song-title')).toBeInViewport();
      for (const id of ['#previous', '#next', '#black', '#clear']) await expect(page.locator(id)).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    });
  });
});

test.describe('Phase 7: GitHub Pages', () => {
  // GitHub Pages serves the app from /worship-presenter/. Serve it the same way,
  // and refuse anything outside that folder, so an address starting with "/"
  // shows up as a failure.
  async function serveFromSubfolder(context) {
    const missed = [];
    await context.route('http://localhost:8123/**', async (route) => {
      const url = new URL(route.request().url());
      const prefix = '/worship-presenter/';
      if (!url.pathname.startsWith(prefix)) {
        missed.push(url.pathname);
        return route.fulfill({ status: 404, body: 'Not in the subfolder' });
      }
      url.pathname = '/' + url.pathname.slice(prefix.length);
      return route.fulfill({ response: await route.fetch({ url: url.href }) });
    });
    return missed;
  }

  test('the Control and TV windows and the Bible work from a subfolder', async ({ page, context }) => {
    const missed = await serveFromSubfolder(context);
    await page.goto('/worship-presenter/');
    await expect(page.locator('.song')).toHaveCount(8);
    const tv = await openDisplay(page);
    expect(new URL(tv.url()).pathname).toBe('/worship-presenter/display.html');

    await tile(page, 0).click();
    await expect(tvText(tv)).toHaveText(/^Amazing grace! How sweet the sound/);

    await page.locator('#tab-bible').click();
    await page.locator('#bible-ref').fill('John 3:16');
    await page.locator('#bible-ref').press('Enter');
    await expect(page.locator('#song-title')).toHaveText('John 3:16 (KJV)');
    await tile(page, 0).click();
    await expect(tvText(tv)).toHaveText(/^For God so loved the world/);
    await expect(tv.locator('#caption')).toHaveText('John 3:16 · KJV');
    expect(missed).toEqual([]);
  });

  test('the About page opens from the Control page and leads back', async ({ page, context }) => {
    const missed = await serveFromSubfolder(context);
    await page.goto('/worship-presenter/');
    await page.getByRole('link', { name: 'About' }).click();
    await expect(page).toHaveURL('/worship-presenter/about.html');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('About Worship Presenter');
    await expect(page.getByText('saved only in this web browser, on this device')).toBeVisible();
    await expect(page.getByText(/King James Version \(KJV\)/)).toBeVisible();
    await expect(page.getByText(/World English Bible \(WEB\)/)).toBeVisible();
    await expect(page.getByText('public domain').first()).toBeVisible();
    await page.getByRole('link', { name: 'Back to Worship Presenter' }).click();
    await expect(page).toHaveURL('/worship-presenter/');
    await expect(page.locator('.song')).toHaveCount(8);
    expect(missed).toEqual([]);
  });

  test('the page-not-found page explains itself and links home', async ({ page }) => {
    await page.goto('/404.html');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('This page isn’t here');
    await page.getByRole('link', { name: 'Go to Worship Presenter' }).click();
    await expect(page.locator('.song')).toHaveCount(8);
  });

  test('the About page fits on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/about.html');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
