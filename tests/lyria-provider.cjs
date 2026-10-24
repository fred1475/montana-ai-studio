'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildLyriaPrompt, createLyriaProvider } = require('../server/lyria-provider.js');

const REQUEST = {
  requestId: '11111111-2222-4333-8444-555555555555',
  prompt: 'Un ritmo original de trap puertorriqueño, bajo profundo y percusión',
  style: '140 BPM, oscuro, contrastes dinámicos',
  lyrics: '[Coro]\nAquí va mi letra original',
  mode: 'vocal',
  durationSeconds: 170,
  language: 'es'
};
const CONTEXT = { userId: 'owner-1', reservationId: 'reservation_12345678' };
const AUDIO = Buffer.from('ID3:synthetic-fixture-not-real-music');

function responseWithAudio(audio = { type: 'audio', data: AUDIO.toString('base64') }) {
  return new Response(JSON.stringify({
    steps: [
      { type: 'model_input', content: [{ type: 'text', text: 'non-audio' }] },
      { type: 'model_output', content: [
        { type: 'text', text: 'Lyrics generated' }, audio
      ] }
    ]
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

test('prompt respects mode, boricua language, own lyrics and approximate duration', () => {
  const prompt = buildLyriaPrompt(REQUEST);
  assert.match(prompt, /español puertorriqueño/);
  assert.match(prompt, /170 segundos/);
  assert.match(prompt, /Lyrics:\n\[Coro\]/);
  assert.match(buildLyriaPrompt({ ...REQUEST, mode: 'instrumental', lyrics: '' }),
    /Solo instrumental/);
  assert.doesNotMatch(buildLyriaPrompt({ ...REQUEST, mode: 'instrumental', lyrics: '' }), /Lyrics:/);
});

test('official Interactions REST endpoint persists private MP3 and returns opaque descriptor', async () => {
  let sent = 0, stored = 0;
  const asset = { assetId: 'asset_12345678', mimeType: 'audio/mpeg', durationSeconds: 169.2 };
  const adapter = createLyriaProvider({
    apiKey: 'server-secret-test-only',
    fetchImpl: async (url, init) => {
      sent++;
      assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
      assert.equal(init.method, 'POST');
      assert.equal(init.headers['x-goog-api-key'], 'server-secret-test-only');
      assert.equal(init.signal.aborted, false);
      const input = JSON.parse(init.body);
      assert.deepEqual(Object.keys(input).sort(), ['input', 'model']);
      assert.equal(input.model, 'lyria-3.5');
      assert.match(input.input, /puertorriqueño/);
      return responseWithAudio();
    },
    storeAudio: async item => {
      stored++;
      assert.deepEqual(item.bytes, AUDIO);
      assert.equal(item.userId, CONTEXT.userId);
      assert.equal(item.reservationId, CONTEXT.reservationId);
      assert.equal(item.mimeType, 'audio/mpeg');
      return asset;
    }
  });
  assert.deepEqual(await adapter.generate(REQUEST, CONTEXT), asset);
  assert.equal(sent, 1);
  assert.equal(stored, 1);
});

test('missing credentials or contradictory instrumental lyrics never call provider', async () => {
  let calls = 0;
  const fakeFetch = async () => { calls++; return responseWithAudio(); };
  const storeAudio = async () => { calls++; };
  const noKey = createLyriaProvider({ storeAudio, fetchImpl: fakeFetch });
  await assert.rejects(noKey.generate(REQUEST, CONTEXT),
    err => err.noCharge === true && err.message === 'LYRIA_NOT_CONFIGURED');
  const configured = createLyriaProvider({ apiKey: 'server-secret-test-only', storeAudio,
    fetchImpl: fakeFetch });
  await assert.rejects(configured.generate({ ...REQUEST, mode: 'instrumental' }, CONTEXT),
    err => err.noCharge === true && err.message === 'LYRIA_INVALID_INPUT');
  assert.equal(calls, 0);
});

test('any provider attempt has ambiguous billing on failure, never silently refunds', async () => {
  let stored = 0;
  const make = fetchImpl => createLyriaProvider({
    apiKey: 'server-secret-test-only', fetchImpl,
    storeAudio: async () => { stored++; }
  });
  for (const response of [
    new Response('not authorized', { status: 401 }),
    new Response('{"steps":[]}', { status: 200 }),
    new Response('{"candidates":[]}', { status: 200 }), // old generateContent shape
    new Response('{"broken"', { status: 200 }),
    responseWithAudio({ type: 'audio', data: '!!!!' })
  ]) {
    await assert.rejects(make(async () => response).generate(REQUEST, CONTEXT),
      err => err.noCharge !== true);
  }
  await assert.rejects(make(async () => { throw new Error('network timeout'); }).generate(REQUEST, CONTEXT),
    err => err.noCharge !== true);
  assert.equal(stored, 0);
});

test('bounded provider response, unexpected MIME and multiple blocks fail before storage', async () => {
  let stored = 0;
  const make = response => createLyriaProvider({
    apiKey: 'server-secret-test-only',
    fetchImpl: async () => response,
    storeAudio: async () => { stored++; }
  });
  await assert.rejects(make(new Response('{}', {
    status: 200, headers: { 'content-length': String(40 * 1024 * 1024) }
  })).generate(REQUEST, CONTEXT), /LYRIA_RESPONSE_TOO_LARGE/);
  await assert.rejects(make(responseWithAudio({
    type: 'audio', mime_type: 'audio/wav', data: AUDIO.toString('base64')
  })).generate(REQUEST, CONTEXT), /LYRIA_UNEXPECTED_FORMAT/);
  await assert.rejects(make(new Response(JSON.stringify({
    steps: [{ type: 'model_output', content: [
      { type: 'audio', data: AUDIO.toString('base64') },
      { type: 'audio', data: AUDIO.toString('base64') }
    ] }]
  }), { status: 200 })).generate(REQUEST, CONTEXT), /LYRIA_AUDIO_COUNT/);
  assert.equal(stored, 0);
});

test('trusted store failures must not be presented as free generations', async () => {
  const adapter = createLyriaProvider({
    apiKey: 'server-secret-test-only', fetchImpl: async () => responseWithAudio(),
    storeAudio: async () => { throw new Error('durable storage unavailable'); }
  });
  await assert.rejects(adapter.generate(REQUEST, CONTEXT),
    err => err.noCharge !== true);
});

test('misconfigured server adapters fail closed', () => {
  assert.throws(() => createLyriaProvider({ apiKey: 'server-secret-test-only' }), TypeError);
  assert.throws(() => createLyriaProvider({
    apiKey: 'server-secret-test-only', storeAudio: async () => {}, timeoutMs: 5
  }), TypeError);
});
