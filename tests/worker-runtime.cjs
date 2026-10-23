'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCloudflareMusicRuntime } = require('../server/worker-runtime');
const { LIVE_FLAG } = require('../server/worker-api');

const origin = 'https://studio.example.test';
const validRequest = {
  requestId: '12345678-1234-4123-a123-123456789abc',
  prompt: 'Crear un instrumental boricua original de prueba',
  style: 'Percusión de prueba, sin material inédito',
  mode: 'instrumental',
  durationSeconds: 170,
  confirmsRights: true,
  consentToSendPrompt: true
};
function request() {
  return new Request('https://private.example.test/v1/generate', {
    method: 'POST', headers: {
      Origin: origin, 'Content-Type': 'application/json'
    }, body: JSON.stringify(validRequest)
  });
}
function arrange(overrides = {}) {
  const trace = {
    providerCalls: 0, reserved: 0, committed: 0, released: 0,
    stored: 0, inspected: 0, screening: 0, responseBody: null
  };
  const sampleBytes = Buffer.alloc(2048, 42);
  const responsePayload = {
    steps: [{ type: 'model_output', content: [{
      type: 'audio', data: sampleBytes.toString('base64')
    }] }]
  };
  const fetchImpl = async (_, args) => {
    trace.providerCalls++;
    trace.responseBody = JSON.parse(args.body);
    if (overrides.providerFailure) return new Response('{}', { status: 500 });
    return new Response(JSON.stringify(responsePayload), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  };
  const quota = {
    reserve: async () => {
      trace.reserved++;
      return { status: 'reserved', reservationId: 'reservation123456789' };
    },
    commit: async (_, asset) => {
      trace.committed++;
      assert.equal(asset.assetId, 'reservation123456789');
    },
    release: async () => { trace.released++; },
    usage: async () => ({ limitCents: 1000, spentCents: 0, reservedCents: 0 })
  };
  const bucket = {
    async put(key, bytes) {
      trace.stored++;
      assert.match(key, /^private-music\/[a-f0-9]{64}\/reservation123456789\.mp3$/);
      assert.deepEqual(Buffer.from(bytes), sampleBytes);
      return { key };
    },
    async get() { return null; }
  };
  const env = {
    STUDIO_ORIGIN: origin,
    ACCESS_AUD: 'access-aud',
    OWNER_EMAIL: 'owner@example.test',
    PRIVATE_GENERATION_ENABLED: LIVE_FLAG,
    LYRIA_API_KEY: 'test-secret-NOT-real',
    DB: {},
    R2: bucket
  };
  const ctx = {
    access: {
      aud: 'access-aud',
      getIdentity: async () => ({ email: 'owner@example.test' })
    }
  };
  const app = createCloudflareMusicRuntime({
    screen: async () => {
      trace.screening++;
      return { allowed: overrides.policyDenied !== true };
    },
    inspectMp3: async () => {
      trace.inspected++;
      return overrides.badAudio ? { decodable: false } :
        { decodable: true, mimeType: 'audio/mpeg', durationSeconds: 168.8 };
    },
    quotaFactory: () => quota,
    fetchImpl
  });
  return { app, trace, env, ctx };
}

test('missing trusted policy/MP3 validation prevents constructing live runtime', () => {
  assert.throws(() => createCloudflareMusicRuntime(), TypeError);
  assert.throws(() => createCloudflareMusicRuntime({
    screen: async () => ({ allowed: true })
  }), TypeError);
});

test('all private adapters can compose without contacting a real paid provider', async () => {
  const { app, trace, env, ctx } = arrange();
  const response = await app.fetch(request(), env, ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    asset: { assetId: 'reservation123456789', mimeType: 'audio/mpeg',
      durationSeconds: 168.8 }
  });
  assert.equal(trace.screening, 1);
  assert.equal(trace.reserved, 1);
  assert.equal(trace.providerCalls, 1);
  assert.equal(trace.inspected, 1);
  assert.equal(trace.stored, 1);
  assert.equal(trace.committed, 1);
  assert.match(trace.responseBody.input, /instrumental boricua/);
});

test('a policy denial prevents a billed request even when private adapters exist', async () => {
  const { app, trace, env, ctx } = arrange({ policyDenied: true });
  const response = await app.fetch(request(), env, ctx);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'POLICY_DENIED');
  assert.equal(trace.reserved, 0);
  assert.equal(trace.providerCalls, 0);
});

test('provider failures keep reservation for reconciliation without automatic refund', async () => {
  const { app, trace, env, ctx } = arrange({ providerFailure: true });
  const response = await app.fetch(request(), env, ctx);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'RECONCILIATION_REQUIRED');
  assert.equal(trace.reserved, 1);
  assert.equal(trace.providerCalls, 1);
  assert.equal(trace.committed, 0);
  assert.equal(trace.released, 0);
});

test('un-decodable response is never stored or committed', async () => {
  const { app, trace, env, ctx } = arrange({ badAudio: true });
  const response = await app.fetch(request(), env, ctx);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'RECONCILIATION_REQUIRED');
  assert.equal(trace.stored, 0);
  assert.equal(trace.committed, 0);
  assert.equal(trace.released, 0);
});

test('no R2 or provider key means no request to model', async () => {
  const { app, trace, env, ctx } = arrange();
  const response = await app.fetch(request(), { ...env, R2: null }, ctx);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'SERVICE_NOT_CONFIGURED');
  assert.equal(trace.reserved, 0);
  assert.equal(trace.providerCalls, 0);
});

test('full adapter chain streams MP3 only after the D1 owner/commit lookup', async () => {
  const { app, env, ctx } = arrange();
  let checked = 0;
  let reads = 0;
  const bytes = new Uint8Array(2048).fill(42);
  env.DB.prepare = sql => {
    assert.match(sql, /user_id=\? AND asset_id=\? AND state='committed'/);
    return {
      bind(userId, assetId) {
        checked++;
        assert.equal(userId, 'owner@example.test');
        assert.equal(assetId, 'reservation123456789');
        return { first: async () => ({
          reservation_id: 'reservation123456789'
        }) };
      }
    };
  };
  env.R2.get = async key => {
    reads++;
    assert.match(key, /^private-music\/[a-f0-9]{64}\/reservation123456789\.mp3$/);
    return {
      size: bytes.byteLength,
      httpMetadata: { contentType: 'audio/mpeg' },
      body: new Response(bytes).body
    };
  };
  const response = await app.fetch(new Request(
    'https://private.example.test/v1/audio/reservation123456789',
    { headers: { Origin: origin } }), env, ctx);
  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  assert.equal(checked, 1);
  assert.equal(reads, 1);
});

test('unauthorized or uncommitted MP3 requests do not read private R2 objects', async () => {
  const { app, env, ctx } = arrange();
  let reads = 0;
  env.R2.get = async () => { reads++; return null; };
  env.DB.prepare = () => ({
    bind: () => ({ first: async () => null })
  });
  const req = new Request(
    'https://private.example.test/v1/audio/reservation123456789',
    { headers: { Origin: origin } });
  assert.equal((await app.fetch(req, env, {})).status, 401);
  assert.equal((await app.fetch(req, env, ctx)).status, 404);
  assert.equal(reads, 0);
});
