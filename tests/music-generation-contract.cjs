'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRequest, createMusicGenerationService, MusicGenerationError } =
  require('../server/music-generation.js');

const REQUEST_ID = '11111111-2222-4333-8444-555555555555';
const ASSET = { assetId: 'asset_00000001', mimeType: 'audio/wav', durationSeconds: 30 };
const REQUEST = { requestId: REQUEST_ID, prompt: 'Instrumental boricua con percusión original',
  style: 'Trap y reggaetón', mode: 'instrumental', durationSeconds: 30,
  language: 'es', confirmsRights: true, consentToSendPrompt: true };

function harness(override = {}) {
  const calls = { screen: 0, reserve: 0, generate: 0, release: 0, commit: 0 };
  const tickets = new Map();
  const quota = {
    async reserve({ userId, requestId, fingerprint }) {
      calls.reserve++;
      const key = `${userId}:${requestId}`;
      if (tickets.has(key)) {
        const old = tickets.get(key);
        if (old.fingerprint !== fingerprint) return { status: 'denied' };
        return old.asset ? { status: 'replay', asset: old.asset } : { status: 'pending' };
      }
      tickets.set(key, { fingerprint });
      return { status: 'reserved', reservationId: 'reservation_000001' };
    },
    async commit(id, asset) {
      calls.commit++;
      assert.equal(id, 'reservation_000001');
      for (const ticket of tickets.values()) ticket.asset = asset;
    },
    async release(id) {
      calls.release++;
      assert.equal(id, 'reservation_000001');
      tickets.clear();
    }
  };
  const provider = { async generate(request, context) {
    calls.generate++;
    assert.deepEqual(Object.keys(context).sort(), ['reservationId', 'userId']);
    assert.equal(request.mode, 'instrumental');
    return { ...ASSET, internalProviderToken: 'MUST_NOT_LEAK', url: 'https://provider.invalid/private' };
  } };
  const service = createMusicGenerationService({
    authenticate: async context => context === 'trusted-session' ? { userId: 'test-user', canGenerate: true } : null,
    screen: async () => { calls.screen++; return { allowed: true }; },
    quota: override.quota || quota, provider: override.provider || provider,
    ...('screen' in override ? { screen: override.screen } : {}),
    ...('authenticate' in override ? { authenticate: override.authenticate } : {})
  });
  return { service, calls, quota, provider };
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, error => {
    assert.ok(error instanceof MusicGenerationError);
    assert.equal(error.code, code);
    assert.equal(error.message, code); // no leaked prompts/URLs or provider secrets
    return true;
  });
}

test('strict DTO: normalize fields and reject client authority, secrets, malformed inputs', () => {
  assert.equal(validateRequest(REQUEST).prompt, REQUEST.prompt);
  assert.equal(validateRequest(REQUEST).style, REQUEST.style);
  for (const bad of [
    null, [], { ...REQUEST, userId: 'admin' }, { ...REQUEST, apiKey: 'exposed' },
    { ...REQUEST, provider: 'charge-to-card' }, { ...REQUEST, price: 0 },
    { ...REQUEST, model: 'unapproved' }, { ...REQUEST, callbackUrl: 'http://localhost' },
    { ...REQUEST, requestId: 'not-uuid' }, { ...REQUEST, durationSeconds: 999 },
    { ...REQUEST, durationSeconds: 17.5 }, { ...REQUEST, mode: 'video' },
    { ...REQUEST, prompt: 'X'.repeat(1401) }, { ...REQUEST, prompt: 'abc' },
    { ...REQUEST, prompt: 'prompt\nsecret text' }, { ...REQUEST, style: 'x'.repeat(241) },
    { ...REQUEST, language: 'zz' }
  ]) assert.throws(() => validateRequest(bad), MusicGenerationError);
  assert.throws(() => validateRequest({ ...REQUEST, confirmsRights: false }),
    error => error.code === 'CONSENT_REQUIRED');
  assert.throws(() => validateRequest({ ...REQUEST, consentToSendPrompt: false }),
    error => error.code === 'CONSENT_REQUIRED');
});

test('fail closed when infrastructure or authentication is absent', async () => {
  assert.throws(() => createMusicGenerationService({}), TypeError);
  const { service, calls } = harness();
  await rejectsCode(service.generate(REQUEST, 'attacker-session'), 'UNAUTHORIZED');
  assert.equal(calls.screen, 0);
  assert.equal(calls.reserve, 0);
  assert.equal(calls.generate, 0);
  const denied = harness({ authenticate: async () => { throw Error('credential secret'); } });
  await rejectsCode(denied.service.generate(REQUEST, 'trusted-session'), 'UNAUTHORIZED');
});

test('policy screening precedes quota and providers and hides prompt on errors', async () => {
  const h = harness({ screen: async () => ({ allowed: false }) });
  await rejectsCode(h.service.generate(REQUEST, 'trusted-session'), 'POLICY_DENIED');
  assert.equal(h.calls.reserve, 0);
  assert.equal(h.calls.generate, 0);
  const down = harness({ screen: async () => { throw Error(REQUEST.prompt); } });
  await rejectsCode(down.service.generate(REQUEST, 'trusted-session'), 'POLICY_UNAVAILABLE');
});

test('successful request returns only private asset descriptor; replay is idempotent', async () => {
  const h = harness();
  const first = await h.service.generate(REQUEST, 'trusted-session');
  assert.deepEqual(first, ASSET);
  const again = await h.service.generate(REQUEST, 'trusted-session');
  assert.deepEqual(again, ASSET);
  assert.equal(h.calls.generate, 1);
  assert.equal(h.calls.commit, 1);
  assert.equal(h.calls.reserve, 2);
  await rejectsCode(h.service.generate({ ...REQUEST, prompt: 'Una petición diferente con la misma clave' },
    'trusted-session'), 'QUOTA_EXCEEDED');
  assert.equal(h.calls.generate, 1);
});

test('in-flight duplicate request does not launch a second paid job', async () => {
  let finish;
  const waiting = new Promise(resolve => { finish = resolve; });
  const h = harness({ provider: { async generate() { h.calls.generate++; return waiting; } } });
  const job = h.service.generate(REQUEST, 'trusted-session');
  // Allow auth/screen/reservation microtasks to complete.
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await rejectsCode(h.service.generate(REQUEST, 'trusted-session'), 'ALREADY_IN_PROGRESS');
  finish(ASSET);
  assert.deepEqual(await job, ASSET);
  assert.equal(h.calls.generate, 1);
});

test('quota denial/unavailability prevents paid provider call', async () => {
  const h = harness({ quota: { reserve: async () => ({ status: 'denied' }),
    commit: async () => {}, release: async () => {} } });
  await rejectsCode(h.service.generate(REQUEST, 'trusted-session'), 'QUOTA_EXCEEDED');
  assert.equal(h.calls.generate, 0);
  const down = harness({ quota: { reserve: async () => { throw Error('billing secret'); },
    commit: async () => {}, release: async () => {} } });
  await rejectsCode(down.service.generate(REQUEST, 'trusted-session'), 'QUOTA_UNAVAILABLE');
});

test('known never-billed failure releases quota; ambiguous failure keeps reservation', async () => {
  const noCharge = harness({ provider: { async generate() {
    const error = Error('provider failure'); error.noCharge = true; throw error;
  } } });
  await rejectsCode(noCharge.service.generate(REQUEST, 'trusted-session'), 'GENERATION_FAILED');
  assert.equal(noCharge.calls.release, 1);
  const uncertain = harness({ provider: { async generate() { throw Error('timeout'); } } });
  await rejectsCode(uncertain.service.generate(REQUEST, 'trusted-session'), 'RECONCILIATION_REQUIRED');
  assert.equal(uncertain.calls.release, 0);
});

test('untrusted outputs and failed commit require reconciliation, never automatic refund', async () => {
  const malformed = harness({ provider: { async generate() {
    return { assetId: 'https://provider.invalid/secret', mimeType: 'audio/wav', durationSeconds: 30 };
  } } });
  await rejectsCode(malformed.service.generate(REQUEST, 'trusted-session'), 'RECONCILIATION_REQUIRED');
  assert.equal(malformed.calls.release, 0);
  const base = harness();
  const commitFails = harness({ quota: { reserve: base.quota.reserve,
    release: base.quota.release, commit: async () => { throw Error('storage down'); } } });
  await rejectsCode(commitFails.service.generate(REQUEST, 'trusted-session'), 'RECONCILIATION_REQUIRED');
  assert.equal(commitFails.calls.release, 0);
});
