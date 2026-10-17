// Browser checks for Worship Presenter.
// Phase 1: the Control and TV windows, keys, Black screen, Clear text, reloads, wake lock, auto-fit.
// Phase 2: the song library and switching between songs.
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
