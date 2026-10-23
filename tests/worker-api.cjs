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
  confirmsRights: true, consentToSendPrompt: true
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
    usage: async () => ({ limitCents: 1000, reservedCents: 8, spentCents: 16 }),
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

test('fixed global budget constants never exceed the approved $10', () => {
  assert.equal(COST_LIMIT_CENTS, 1000);
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
    limitCents: 1000, spentCents: 16, reservedCents: 8, remainingCents: 976
  });
  assert.equal(response.headers.get('cache-control'), 'no-store');
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
    usage: async () => ({ limitCents: 1000, spentCents: 0, reservedCents: 0 })
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
