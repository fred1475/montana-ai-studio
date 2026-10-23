'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeOrigin, prepareRequest, createPrivateGenerationClient, COST_PER_SONG_CENTS
} = require('../private-music-generation.js');

const apiOrigin = 'https://private-music.example.test';
const id = '12345678-1234-4123-a123-123456789abc';
const valid = {
  prompt: 'Tema boricua original con percusión intensa',
  style: 'Bajo 808 con textura oscura, piano menor',
  lyrics: '[Coro]\nDesde abajo seguimos pa lante',
  mode: 'vocal', durationSeconds: 170, language: 'es',
  confirmsRights: true, consentToSendPrompt: true, confirmsCost: true
};
const quota = {
  limitCents: 300, spentCents: 16, reservedCents: 8,
  remainingCents: 276, pendingReservations: 0
};
function reply(payload, status = 200, sizeOverride) {
  const body = JSON.stringify(payload);
  return new Response(body, {
    status,
    headers: {
      'content-type': 'application/json',
      'content-length': sizeOverride ?? String(Buffer.byteLength(body))
    }
  });
}
function client(fetchImpl) {
  return createPrivateGenerationClient({ apiOrigin, uuid: () => id, fetchImpl });
}

test('invalid private host and invalid consent fail before all network traffic', async () => {
  for (const host of ['', 'http://private-music.example.test',
    'https://private-music.example.test/path',
    'https://user:password@private-music.example.test']) {
    assert.throws(() => normalizeOrigin(host), /SERVIDOR_NO_CONFIGURADO/);
  }
  let calls = 0;
  const app = client(async () => { calls++; return reply(quota); });
  await assert.rejects(app.generate({ ...valid, confirmsCost: false }),
    /CONSENTIMIENTO_REQUERIDO/);
  await assert.rejects(app.generate({ ...valid, consentToSendPrompt: false }),
    /CONSENTIMIENTO_REQUERIDO/);
  await assert.rejects(app.generate({ ...valid, confirmsRights: false }),
    /CONSENTIMIENTO_REQUERIDO/);
  await assert.rejects(app.generate({ ...valid, prompt: 'short' }),
    /SOLICITUD_INVALIDA/);
  await assert.rejects(app.generate({ ...valid, mode: 'instrumental' }),
    /SOLICITUD_INVALIDA/);
  assert.equal(calls, 0);
});

test('client rejects unexpectedly large generation allocation under total ten-dollar cap', async () => {
  const app = client(async () => reply({
    limitCents: 1000, spentCents: 0, reservedCents: 0,
    remainingCents: 1000, pendingReservations: 0
  }));
  await assert.rejects(app.generate(valid), /SALDO_PRIVADO_INVALIDO/);
});

test('limits match the lyric/style contract and reject malformed client identifiers', () => {
  assert.equal(COST_PER_SONG_CENTS, 8);
  assert.equal(prepareRequest(valid, () => id).requestId, id);
  assert.throws(() => prepareRequest({ ...valid, lyrics: 'x'.repeat(5001) },
    () => id), /SOLICITUD_INVALIDA/);
  assert.throws(() => prepareRequest({ ...valid, style: 'x'.repeat(1001) },
    () => id), /SOLICITUD_INVALIDA/);
  assert.throws(() => prepareRequest(valid, () => '../secret'), /ID_DE_SOLICITUD_INVALIDO/);
});

test('real generation requests balance before spending, without keys or supplied prices', async () => {
  const trace = [];
  const app = client(async (url, options) => {
    trace.push({ url, options });
    assert.equal(options.credentials, 'include');
    assert.equal(options.redirect, 'error');
    if (url.endsWith('/v1/usage')) return reply(quota);
    assert.equal(url, apiOrigin + '/v1/generate');
    assert.equal(options.method, 'POST');
    const input = JSON.parse(options.body);
    assert.deepEqual(input, {
      requestId: id, prompt: valid.prompt, style: valid.style,
      lyrics: valid.lyrics, mode: 'vocal', durationSeconds: 170,
      language: 'es', confirmsRights: true, consentToSendPrompt: true
    });
    assert.equal('confirmsCost' in input, false);
    assert.equal('apiKey' in input, false);
    assert.equal('price' in input, false);
    return reply({ asset: {
      assetId: 'reservation123456789',
      mimeType: 'audio/mpeg', durationSeconds: 168.5
    } });
  });
  const asset = await app.generate(valid);
  assert.deepEqual(asset, {
    assetId: 'reservation123456789', mimeType: 'audio/mpeg',
    durationSeconds: 168.5, requestId: id
  });
  assert.equal(trace.length, 2);
  assert.equal(trace[0].url, apiOrigin + '/v1/usage');
  assert.equal(trace[0].options.method, 'GET');
});

test('a depleted or inconsistent budget blocks generation before the paid POST', async () => {
  let calls = 0;
  const depleted = client(async () => {
    calls++;
    return reply({
      limitCents: 300, spentCents: 293, reservedCents: 0,
      remainingCents: 7, pendingReservations: 0
    });
  });
  await assert.rejects(depleted.generate(valid), /PRESUPUESTO_AGOTADO/);
  assert.equal(calls, 1);

  const inconsistent = client(async () => {
    calls++;
    return reply({
      limitCents: 300, spentCents: 2, reservedCents: 0,
      remainingCents: 300, pendingReservations: 0
    });
  });
  await assert.rejects(inconsistent.generate(valid), /SALDO_PRIVADO_INVALIDO/);
  assert.equal(calls, 2);
});

test('an unresolved previous-month charge blocks a new paid POST', async () => {
  const endpoints = [];
  const app = client(async url => {
    endpoints.push(url);
    return reply({
      limitCents: 300, spentCents: 0, reservedCents: 0,
      remainingCents: 300, pendingReservations: 1
    });
  });
  await assert.rejects(app.generate(valid), /CONCILIACION_PENDIENTE/);
  assert.deepEqual(endpoints, [apiOrigin + '/v1/usage']);
});

test('missing global pending status is not mistaken for permission to spend', async () => {
  const app = client(async () => reply({
    limitCents: 300, spentCents: 0, reservedCents: 0,
    remainingCents: 300
  }));
  await assert.rejects(app.generate(valid), /SALDO_PRIVADO_INVALIDO/);
});

test('owner can inspect pending reservations without a generation POST', async () => {
  const endpoints = [];
  const app = client(async url => {
    endpoints.push(url);
    return reply({ pending: [{
      reservationId: 'reservation0123456789',
      month: '2026-09', reservedCents: 8
    }] });
  });
  assert.deepEqual(await app.pending(), [{
    reservationId: 'reservation0123456789',
    month: '2026-09', reservedCents: 8
  }]);
  assert.deepEqual(endpoints, [apiOrigin + '/v1/pending']);
  const broken = client(async () => reply({ pending: [{
    reservationId: 'https://public.invalid/bad',
    month: '2026-09', reservedCents: 8
  }] }));
  await assert.rejects(broken.pending(), /CONCILIACION_NO_DISPONIBLE/);
});

test('server is disabled by default; no automatic paid retries follow 503', async () => {
  const endpoints = [];
  const app = client(async (url) => {
    endpoints.push(url);
    return url.endsWith('/usage') ?
      reply(quota) : reply({ error: 'GENERATION_NOT_ENABLED' }, 503);
  });
  await assert.rejects(app.generate(valid), /GENERATION_NOT_ENABLED/);
  assert.equal(endpoints.length, 2);
});

test('malformed audio descriptors and oversized server JSON are rejected', async () => {
  const app = client(async url => url.endsWith('/usage') ? reply(quota) :
    reply({ asset: {
      assetId: 'https://invalid.example.test/audio', mimeType: 'audio/mpeg',
      durationSeconds: 200
    } }));
  await assert.rejects(app.generate(valid), /RESULTADO_INVALIDO/);
  const bad = client(async () => reply(quota, 200, '40000'));
  await assert.rejects(bad.usage(), /RESPUESTA_DEMASIADO_GRANDE/);
});
