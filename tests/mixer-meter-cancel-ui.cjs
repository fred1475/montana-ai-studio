'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const rate = 44100;
const wav = Buffer.alloc(44 + rate * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVE', 8); wav.write('fmt ', 12); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(rate * 2, 40);
for (let i = 0; i < rate; i++) wav.writeInt16LE(Math.round(9000 * Math.sin(2 * Math.PI * 440 * i / rate)), 44 + i * 2);

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8765/mixer-8.html');
    await page.locator('#file1').setInputFiles({ name: 'voz-original.wav', mimeType: 'audio/wav', buffer: wav });
    await page.waitForFunction(() => document.querySelector('#label1')?.textContent?.includes('voz-original'));

    // Instrument a deliberately pending meter. This tests the UI's AbortSignal
    // wiring without waiting minutes or touching a physical audio device.
    await page.evaluate(() => {
      window.__meterSignals = 0;
      MontanaLoudness.measure = (_left, _right, _rate, options) => new Promise((_resolve, reject) => {
        if (!options?.signal) return reject(Error('Falta señal de cancelación'));
        window.__meterSignals++;
        if (options.signal.aborted) return reject(Error('Medición cancelada'));
        options.signal.addEventListener('abort', () => reject(Error('Medición cancelada')), { once: true });
      });
    });

    assert.equal(await page.locator('#cancelMeterAnalysis').isDisabled(), true);
    await page.locator('#loudnessOn').check();
    await page.locator('#export').click();
    await page.waitForFunction(() => !document.querySelector('#cancelMeterAnalysis')?.disabled);
    const wavDownload = page.waitForEvent('download');
    await page.locator('#cancelMeterAnalysis').click();
    assert.equal((await wavDownload).suggestedFilename(), 'montana-ai-studio-mezcla.wav');
    await page.waitForFunction(() => !document.querySelector('#export')?.disabled);
    assert.match(await page.locator('#loudnessResults').innerText(), /Medición cancelada/);
    assert.match(await page.locator('#status').innerText(), /Archivo WAV PCM16/);
    assert.equal(await page.locator('#cancelMeterAnalysis').isDisabled(), true);

    await page.locator('#loudnessOn').uncheck();
    await page.locator('#auditOn').check();
    await page.locator('#export').click();
    await page.waitForFunction(() => !document.querySelector('#cancelMeterAnalysis')?.disabled);
    const auditWav = page.waitForEvent('download');
    await page.locator('#cancelMeterAnalysis').click();
    assert.equal((await auditWav).suggestedFilename(), 'montana-ai-studio-mezcla.wav');
    await page.waitForFunction(() => !document.querySelector('#export')?.disabled);
    assert.match(await page.locator('#auditStatus').innerText(), /Medición cancelada/);
    assert.equal(await page.locator('#downloadAudit').isDisabled(), true);
    assert.equal(await page.evaluate(() => window.montanaLastAudit), null);
    assert.equal(await page.evaluate(() => window.__meterSignals), 2);

    // One click skips all remaining optional analyses, not just the first one.
    await page.locator('#loudnessOn').check();
    await page.locator('#export').click();
    await page.waitForFunction(() => !document.querySelector('#cancelMeterAnalysis')?.disabled);
    const bothWav = page.waitForEvent('download');
    await page.locator('#cancelMeterAnalysis').click();
    assert.equal((await bothWav).suggestedFilename(), 'montana-ai-studio-mezcla.wav');
    await page.waitForFunction(() => !document.querySelector('#export')?.disabled);
    assert.match(await page.locator('#auditStatus').innerText(), /omitida por cancelación/);
    assert.equal(await page.evaluate(() => window.__meterSignals), 3);
    assert.equal(await page.locator('#downloadAudit').isDisabled(), true);
    const original = Buffer.from(await page.evaluate(async () => new Uint8Array(await originalFiles[1].arrayBuffer())));
    assert.deepEqual(original, wav, 'No modification of imported source');
    assert.deepEqual(errors, []);
    console.log('PASS browser meter cancellation: R128 and audit stop, WAV still downloads, source intact.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
