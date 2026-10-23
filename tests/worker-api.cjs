'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createPrivateMusicGateway, LIVE_FLAG, COST_LIMIT_CENTS, COST_PER_SONG_CENTS
} = require('../server/worker-api');

const origin = 'https://studio.example.test';
const env = {
  STUDIO_ORIGIN: origin, ACCESS_AUD: 'secure-access-audience',
  OWNER_EMAIL: 'owner@example.test', PRIVATE_GENERATION_ENABLED: LIVE_FLAG,
  DB: {}
};
const ctx = {
  access: {
    aud: env.ACCESS_AUD,
    getIdentity: async () => ({ email: 'OWNER@example.test' })
  }
};
const validBody = {
  requestId: '12345678-1234-4123-a123-123456789abc',
  prompt: 'Original instrumental de prueba sin material privado',
  mode: 'instrumental', durationSeconds: 170,
  confirmsRights: true, consentToSendPrompt: true, confirmsCost: true
};

function post(body = validBody, headers = {}) {
  return new Request('https://private.example.test/v1/generate', {
    method: 'POST', headers: {
      Origin: origin, 'Content-Type': 'application/json', ...headers
    }, body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}
function use(path = '/v1/usage', options = {}) {
  return new Request('https://private.example.test' + path, options);
}
function services(overrides = {}) {
  const trace = { providerCalls: 0, screens: 0, reservations: 0 };
  const quota = {
    usage: async () => ({ limitCents: 300, reservedCents: 8, spentCents: 16 }),
    pendingCount: async () => 1,
    pending: async () => [{
      reservationId: 'reservation0123456789', month: '2026-10', reservedCents: 8
    }],
    reserve: async () => {
      trace.reservations++;
      return { status: 'reserved', reservationId: 'reservation0123456789' };
    },
    commit: async () => {},
    release: async () => {},
    ...overrides.quota
  };
  const app = createPrivateMusicGateway({
    quotaFactory: () => quota,
    policyScreen: async () => { trace.screens++; return { allowed: true }; },
    providerFactory: () => ({
      generate: async () => {
        trace.providerCalls++;
        return { assetId: 'asset-0123456789', mimeType: 'audio/mpeg',
          durationSeconds: 169.5 };
      }
    }),
    ...overrides.factory
  });
  return { app, trace };
}

test('generation ledger reserves $3 under the approved $10 total pilot', () => {
  assert.equal(COST_LIMIT_CENTS, 300);
  assert.equal(COST_PER_SONG_CENTS, 8);
  assert.equal(typeof LIVE_FLAG, 'string');
});

test('health is a non-billing public endpoint', async () => {
  const { app, trace } = services();
  const response = await app.fetch(use('/health'), {}, {});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).liveGeneration, false);
  assert.equal(trace.providerCalls, 0);
});

test('reject unauthenticated users and unapproved identities before quota/provider', async () => {
  const { app, trace } = services();
  const noAccess = await app.fetch(post(), env, {});
  assert.equal(noAccess.status, 401);
  const wrongAudience = await app.fetch(post(), env, {
    access: { aud: 'wrong', getIdentity: ctx.access.getIdentity }
  });
  assert.equal(wrongAudience.status, 401);
  const wrongUser = await app.fetch(post(), env, {
    access: { aud: env.ACCESS_AUD, getIdentity: async () => ({ email: 'visitor@example.test' }) }
  });
  assert.equal(wrongUser.status, 401);
  assert.equal(trace.reservations, 0);
  assert.equal(trace.providerCalls, 0);
});

test('usage is private and excludes credentials and provider details', async () => {
  const { app } = services();
  const response = await app.fetch(use(), env, ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    limitCents: 300, spentCents: 16, reservedCents: 8,
    remainingCents: 276, pendingReservations: 1
  });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('private balance fails closed when cross-month pending status is unavailable', async () => {
  const { app } = services({ quota: { pendingCount: async () => { throw new Error('D1 down'); } } });
  const response = await app.fetch(use(), env, ctx);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'QUOTA_UNAVAILABLE' });
});

test('reconciliation inventory requires private identity and verified browser origin', async () => {
  const { app, trace } = services();
  const request = use('/v1/pending', { headers: { Origin: origin } });
  const response = await app.fetch(request, env, ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { pending: [{
    reservationId: 'reservation0123456789', month: '2026-10', reservedCents: 8
  }] });
  assert.equal((await app.fetch(request, env, {})).status, 401);
  assert.equal((await app.fetch(use('/v1/pending'), env, ctx)).status, 403);
  assert.equal((await app.fetch(use('/v1/pending', {
    headers: { Origin: 'https://evil.example.test' }
  }), env, ctx)).status, 403);
  assert.equal(trace.providerCalls, 0);
  assert.equal(trace.reservations, 0);
});

test('private reconciliation cannot be used to mutate a reservation', async () => {
  const { app, trace } = services();
  const wrongMethod = await app.fetch(use('/v1/pending', {
    method: 'POST', headers: { Origin: origin }
  }), env, ctx);
  assert.equal(wrongMethod.status, 405);
  const fail = services({ quota: {
    pending: async () => { throw new Error('private database error'); }
  } });
  const response = await fail.app.fetch(use('/v1/pending', {
    headers: { Origin: origin }
  }), env, ctx);
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes('private database error'), false);
  assert.equal(trace.reservations, 0);
});
test('generation is disabled by default even if adapters are provided', async () => {
  const { app, trace } = services();
  const response = await app.fetch(post(), { ...env, PRIVATE_GENERATION_ENABLED: undefined }, ctx);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'GENERATION_NOT_ENABLED');
  assert.equal(trace.reservations, 0);
  assert.equal(trace.providerCalls, 0);
});

test('requires a reviewed policy and provider before live generation', async () => {
  const app = createPrivateMusicGateway({ quotaFactory: () => ({
    usage: async () => ({ limitCents: 300, spentCents: 0, reservedCents: 0 })
  }) });
  const response = await app.fetch(post(), env, ctx);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'GENERATION_NOT_ENABLED');
});

test('POST requires exact origin, JSON content type and valid body', async () => {
  const { app, trace } = services();
  const wrongOrigin = await app.fetch(post(validBody, { Origin: 'https://evil.example.test' }), env, ctx);
  assert.equal(wrongOrigin.status, 403);
  assert.equal(wrongOrigin.headers.get('Access-Control-Allow-Origin'), null);
  const noOrigin = await app.fetch(post(validBody, { Origin: '' }), env, ctx);
  assert.equal(noOrigin.status, 403);
  const wrongType = await app.fetch(post(validBody, { 'Content-Type': 'text/plain' }), env, ctx);
  assert.equal(wrongType.status, 415);
  const malformed = await app.fetch(post('{"broken":'), env, ctx);
  assert.equal(malformed.status, 400);
  const noPriceConsent = await app.fetch(post({ ...validBody, confirmsCost: false }), env, ctx);
  assert.equal(noPriceConsent.status, 400);
  assert.equal((await noPriceConsent.json()).error, 'CONSENT_REQUIRED');
  assert.equal(trace.reservations, 0);
  assert.equal(trace.providerCalls, 0);
});

test('reject oversized bodies without spending', async () => {
  const { app, trace } = services();
  const response = await app.fetch(post('x'.repeat(33 * 1024)), env, ctx);
  assert.equal(response.status, 413);
  assert.equal(trace.reservations, 0);
  assert.equal(trace.providerCalls, 0);
});

test('a safe generation response contains only an opaque asset descriptor', async () => {
  const { app, trace } = services();
  const response = await app.fetch(post(), env, ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    asset: { assetId: 'asset-0123456789', mimeType: 'audio/mpeg',
      durationSeconds: 169.5 }
  });
  assert.equal(trace.screens, 1);
  assert.equal(trace.reservations, 1);
  assert.equal(trace.providerCalls, 1);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
});

test('denied budget fails closed before invoking any paid provider', async () => {
  const { app, trace } = services({
    quota: { reserve: async () => ({ status: 'denied' }) }
  });
  const response = await app.fetch(post(), env, ctx);
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error, 'QUOTA_EXCEEDED');
  assert.equal(trace.providerCalls, 0);
});

test('a pending request must never invoke a second paid generation', async () => {
  const { app, trace } = services({
    quota: { reserve: async () => ({ status: 'pending' }) }
  });
  const response = await app.fetch(post(), env, ctx);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'ALREADY_IN_PROGRESS');
  assert.equal(trace.providerCalls, 0);
});

test('missing configuration and disallowed origin are rejected', async () => {
  const { app } = services();
  const missingOrigin = await app.fetch(post(), { ...env, STUDIO_ORIGIN: '' }, ctx);
  assert.equal(missingOrigin.status, 503);
  const invalidOrigin = await app.fetch(post(), {
    ...env, STUDIO_ORIGIN: 'http://studio.example.test'
  }, ctx);
  assert.equal(invalidOrigin.status, 503);
});

test('CORS preflight allows only configured origin and no wildcard', async () => {
  const { app, trace } = services();
  const response = await app.fetch(use('/v1/generate', {
    method: 'OPTIONS', headers: { Origin: origin }
  }), env, {});
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('access-control-allow-headers'), 'Content-Type');
  assert.equal(trace.providerCalls, 0);
});

function audioGet(assetId = 'reservation0123456789', options = {}) {
  return new Request('https://private.example.test/v1/audio/' + assetId, {
    headers: { Origin: origin, ...options.headers },
    method: options.method || 'GET'
  });
}
function privateAudioGateway({ object, onLookup } = {}) {
  const trace = { storeCreations: 0, lookups: 0 };
  const app = createPrivateMusicGateway({
    quotaFactory: () => ({
      usage: async () => ({ limitCents: 300, spentCents: 0, reservedCents: 0 })
    }),
    audioStoreFactory: () => {
      trace.storeCreations++;
      return {
        async getOwnedAudio(args) {
          trace.lookups++;
          assert.equal(args.userId, 'owner@example.test');
          assert.equal(args.assetId, 'reservation0123456789');
          assert.equal(args.db, env.DB);
          if (onLookup) return onLookup(args);
          return object;
        }
      };
    }
  });
  return { app, trace };
}
function mp3Object(overrides = {}) {
  return {
    size: 2048,
    httpMetadata: { contentType: 'audio/mpeg' },
    body: new Response(new Uint8Array(2048).fill(42)).body,
    ...overrides
  };
}

test('private MP3 plays only for Access-authenticated owner and exact origin', async () => {
  const { app, trace } = privateAudioGateway({ object: mp3Object() });
  const disabledEnv = { ...env, PRIVATE_GENERATION_ENABLED: undefined };
  const result = await app.fetch(audioGet(), disabledEnv, ctx);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('Content-Type'), 'audio/mpeg');
  assert.equal(result.headers.get('Content-Length'), '2048');
  assert.equal(result.headers.get('Cache-Control'), 'no-store');
  assert.equal(result.headers.get('access-control-allow-origin'), origin);
  assert.equal(result.headers.get('Content-Disposition'),
    'inline; filename="montana-ai-studio.mp3"');
  assert.equal((await result.arrayBuffer()).byteLength, 2048);
  assert.equal(trace.lookups, 1);
});

test('audio rejects missing/wrong Access, origin, and unsupported request method', async () => {
  const { app, trace } = privateAudioGateway({ object: mp3Object() });
  assert.equal((await app.fetch(audioGet(), env, {})).status, 401);
  assert.equal((await app.fetch(audioGet(), env, {
    access: { aud: env.ACCESS_AUD,
      getIdentity: async () => ({ email: 'intruder@example.test' }) }
  })).status, 401);
  assert.equal((await app.fetch(audioGet('reservation0123456789', {
    headers: { Origin: 'https://untrusted.example.test' }
  }), env, ctx)).status, 403);
  assert.equal((await app.fetch(audioGet('reservation0123456789', {
    headers: { Origin: '' }
  }), env, ctx)).status, 403);
  assert.equal((await app.fetch(audioGet('reservation0123456789', {
    headers: { Range: 'bytes=0-100' }
  }), env, ctx)).status, 416);
  assert.equal((await app.fetch(audioGet('reservation0123456789', {
    method: 'DELETE'
  }), env, ctx)).status, 405);
  assert.equal((await app.fetch(audioGet('bad'), env, ctx)).status, 404);
  assert.equal(trace.lookups, 0);
});

test('private audio hides absent assets, blocks invalid stored media, and fails closed', async () => {
  const absent = privateAudioGateway({ object: null });
  assert.equal((await absent.app.fetch(audioGet(), env, ctx)).status, 404);
  const tooLarge = privateAudioGateway({ object: mp3Object({
    size: 21 * 1024 * 1024
  }) });
  const r1 = await tooLarge.app.fetch(audioGet(), env, ctx);
  assert.equal(r1.status, 503);
  assert.equal((await r1.json()).error, 'AUDIO_UNAVAILABLE');
  const wrongMime = privateAudioGateway({ object: mp3Object({
    httpMetadata: { contentType: 'text/html' }
  }) });
  assert.equal((await wrongMime.app.fetch(audioGet(), env, ctx)).status, 503);
  const brokenDb = privateAudioGateway({
    onLookup: async () => { throw new Error('secret database details'); }
  });
  const r2 = await brokenDb.app.fetch(audioGet(), env, ctx);
  assert.equal(r2.status, 503);
  assert.equal((await r2.text()).includes('secret database details'), false);
  const missingStorage = createPrivateMusicGateway({
    quotaFactory: () => ({ usage: async () => ({ limitCents: 300 }) })
  });
  const r3 = await missingStorage.fetch(audioGet(), env, ctx);
  assert.equal(r3.status, 503);
  assert.equal((await r3.json()).error, 'AUDIO_NOT_CONFIGURED');
});
