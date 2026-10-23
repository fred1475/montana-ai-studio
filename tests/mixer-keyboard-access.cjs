'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8765/mixer-8.html');

    // First Tab must reveal a high-contrast shortcut to the 8-track workspace.
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.className), 'skip');
    const focus = await page.locator('a.skip').evaluate(el => ({
      visible: el.getBoundingClientRect().top >= 0,
      style: getComputedStyle(el).outlineStyle,
      width: getComputedStyle(el).outlineWidth
    }));
    assert.equal(focus.visible, true, 'Keyboard users can see the skip link');
    assert.equal(focus.style, 'solid', 'Focused controls have a visible outline');
    assert.equal(focus.width, '3px');
    await page.keyboard.press('Enter');
    assert.equal(new URL(page.url()).hash, '#tracks');

    // Core controls must expose accessible names without mouse-only gestures.
    for (const id of ['masterGain', 'recordTrack', 'recordFormat', 'micInput',
      'file1', 'vol1', 'pan1', 'offset1', 'trimStart1', 'trimEnd1']) {
      assert.equal(await page.locator('#' + id).evaluate(el => Boolean(el.labels?.length ||
        el.getAttribute('aria-label') || el.getAttribute('aria-labelledby'))), true, id + ' has a name');
    }
    assert.equal(await page.getByRole('button', { name: /Grabar voz/ }).count(), 1);
    assert.equal(await page.getByRole('button', { name: /Buscar entradas/ }).count(), 1);

    await page.locator('#mute1').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#mute1').isChecked(), true, 'Space toggles mute');
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#mute1').isChecked(), false, 'Space toggles mute back');
    await page.locator('#compDetails1 summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#compDetails1').getAttribute('open'), '',
      'Enter expands compressor options');

    assert.deepEqual(errors, [], 'No uncaught browser errors');
    console.log('PASS mixer keyboard accessibility: skip link, visible focus, names, native actions.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
