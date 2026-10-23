'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    const unexpectedRemote = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (!request.url().startsWith('http://127.0.0.1:8765/')) {
        unexpectedRemote.push(request.url());
      }
    });
    await page.goto('http://127.0.0.1:8765/ai-music-lab.html');

    assert.equal(await page.locator('#generateButton').isDisabled(), true);
    assert.equal(await page.locator('#usageButton').isDisabled(), true);
    assert.match(await page.locator('#connectionStatus').textContent(), /sin configurar/i);
    await page.locator('#prompt').fill('Canción original boricua de prueba');
    await page.locator('#style').fill('Bombo, caja, 808, piano menor');
    await page.locator('#lyrics').fill('[Coro]\nAquí seguimos haciendo música');
    await page.locator('#rights').check();
    await page.locator('#privacy').check();
    await page.locator('#cost').check();
    assert.equal(await page.locator('#generateButton').isDisabled(), true,
      'Consent cannot activate a missing private backend');
    assert.match(await page.locator('#characterCount').textContent(), /Letra: [1-9]/);

    await page.locator('#mode').selectOption('instrumental');
    assert.equal(await page.locator('#lyrics').isDisabled(), true);
    assert.equal(await page.locator('#lyrics').inputValue(), '');
    assert.equal(await page.locator('#listenButton').isDisabled(), true);
    assert.equal(await page.locator('#downloadButton').isDisabled(), true);
    assert.equal(await page.locator('#copyButton').isDisabled(), true);
    assert.equal(await page.locator('#assetId').inputValue(), '');
    assert.deepEqual(unexpectedRemote, [], 'No paid/third-party requests in offline lab');
    assert.deepEqual(errors, [], 'Browser scripts must run without page errors');

    await page.goto('http://127.0.0.1:8765/mixer-8.html');
    assert.equal(await page.locator('#privateAiImportButton').isDisabled(), true);
    assert.match(await page.locator('#privateAiImportStatus').textContent(),
      /sin configurar|inactiva/i);
    assert.equal(await page.locator('article.track').count(), 8);
    assert.deepEqual(errors, [], 'Mixer must remain compatible with disabled AI bridge');
  } finally {
    await browser.close();
  }
  console.log('AI music browser acceptance: offline safeguards PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
