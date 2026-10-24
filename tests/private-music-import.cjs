'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { privateOrigin, fetchPrivateMp3 } = require('../private-music-import.js');

const apiOrigin = 'https://music-private.example.test';
const assetId = 'reservation123456789';

function mp3Response(bytes = new Uint8Array(2048).fill(42), overrides = {}) {
  return new Response(bytes, {
    status: overrides.status || 200,
    headers: {
      'Content-Type': overrides.type || 'audio/mpeg',
      'Content-Length': overrides.length ?? String(bytes.byteLength)
    }
  });
}

test('the client rejects missing, HTTP, credentialed and malformed private origins', async () => {
  for (const unsafe of ['', 'http://music-private.example.test',
    'https://owner:pass@music-private.example.test',
    'https://music-private.example.test/path',
    'https://music-private.example.test/']) {
    assert.throws(() => privateOrigin(unsafe), /SERVIDOR_PRIVADO_NO_CONFIGURADO/);
  }
  assert.equal(privateOrigin(apiOrigin), apiOrigin);
  await assert.rejects(fetchPrivateMp3({
    apiOrigin: '', assetId, fetchImpl: () => { throw Error('Unexpected request'); }
  }), /SERVIDOR_PRIVADO_NO_CONFIGURADO/);
});

test('a trusted audio fetch uses Access credentials, no caching and exact opaque ID', async () => {
  let calls = 0;
  const bytes = await fetchPrivateMp3({
    apiOrigin, assetId,
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, apiOrigin + '/v1/audio/' + assetId);
      assert.equal(options.credentials, 'include');
      assert.equal(options.mode, 'cors');
      assert.equal(options.cache, 'no-store');
      assert.equal(options.redirect, 'error');
      assert.equal(options.method, 'GET');
      return mp3Response();
    }
  });
  assert.equal(calls, 1);
  assert.equal(bytes.byteLength, 2048);
  assert.equal(bytes[0], 42);
});

test('malformed asset IDs are rejected before any network request', async () => {
  for (const id of ['abc', '../secrets', '%2fexample', 'a'.repeat(129)]) {
    await assert.rejects(fetchPrivateMp3({
      apiOrigin, assetId: id,
      fetchImpl: () => { throw Error('Must not call network'); }
    }), /IDENTIFICADOR_INVALIDO/);
  }
});

test('failed authentication, absent song and other HTTP statuses reveal no remote body', async () => {
  for (const [status, code] of [
    [401, 'ACCESO_PRIVADO_REQUERIDO'],
    [403, 'ACCESO_PRIVADO_REQUERIDO'],
    [404, 'AUDIO_NO_ENCONTRADO'],
    [503, 'AUDIO_PRIVADO_NO_DISPONIBLE']
  ]) {
    await assert.rejects(fetchPrivateMp3({
      apiOrigin, assetId,
      fetchImpl: async () => ({ status })
    }), new RegExp(code));
  }
});

test('MIME, missing lengths, oversized claims and truncated streams fail closed', async () => {
  const cases = [
    mp3Response(new Uint8Array(2048), { type: 'text/html' }),
    mp3Response(new Uint8Array(2048), { length: '0' }),
    mp3Response(new Uint8Array(2048), { length: String(21 * 1024 * 1024) }),
    mp3Response(new Uint8Array(2048), { length: '2049' })
  ];
  for (const response of cases) {
    await assert.rejects(fetchPrivateMp3({
      apiOrigin, assetId, fetchImpl: async () => response
    }), /RESPUESTA_NO_ES_MP3|TAMANO_MP3_INVALIDO/);
  }
});

test('a stream that exceeds its declared length is never returned to the mixer', async () => {
  const response = mp3Response(new Uint8Array(2050), { length: '2048' });
  await assert.rejects(fetchPrivateMp3({
    apiOrigin, assetId, fetchImpl: async () => response
  }), /TAMANO_MP3_INVALIDO/);
});
