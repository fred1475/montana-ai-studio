import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { handlePreflight } from '../server/private-preflight.mjs';

const url = 'https://preflight.example.test/v1/preflight';
const origin = 'https://montanamusicproduction.com';
const env = () => ({
  STUDIO_ORIGIN: origin,
  ACCESS_AUD: 'aud-123',
  OWNER_EMAIL: 'owner@example.test',
  DB: { prepare() { throw new Error('D1 MUST NOT BE CALLED'); },
    batch() { throw new Error('D1 MUST NOT BE CALLED'); } },
  R2: { get() { throw new Error('R2 MUST NOT BE CALLED'); },
    put() { throw new Error('R2 MUST NOT BE CALLED'); } },
  LYRIA_API_KEY: 'hidden-secret-value',
  PRIVATE_GENERATION_ENABLED: 'YES_I_APPROVE_REAL_GENERATION_COSTS'
});
const ctx = (email = 'owner@example.test', aud = 'aud-123') => ({
  access: { aud, getIdentity: async () => ({ email }) }
});
const get = (path = url, requestOrigin = origin) =>
  new Request(path, { headers: { Origin: requestOrigin } });

test('the preflight is a genuine, read-only Workers fetch entry', async () => {
  assert.equal(typeof worker.fetch, 'function');
  const response = await worker.fetch(get(), env(), ctx());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), 'true');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const payload = await response.json();
  assert.equal(payload.liveGeneration, false);
  assert.equal(payload.canGenerate, false);
  assert.deepEqual(payload.checks, {
    accessAuthenticated: true, originConfigured: true,
    d1Bound: true, r2Bound: true, googleKeyPresent: true
  });
  assert.doesNotMatch(JSON.stringify(payload), /owner@example|hidden-secret/);
});

test('the preflight rejects absent or forged Cloudflare Access identity', async () => {
  for (const badCtx of [
    {}, { access: { aud: 'aud-123' } }, ctx('hacker@example.test'),
    ctx('owner@example.test', 'wrong-audience'),
    { access: { aud: 'aud-123', getIdentity: async () => { throw Error('offline'); } } }
  ]) {
    const response = await handlePreflight(get(), env(), badCtx);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'UNAUTHORIZED' });
  }
  const noOwner = { ...env(), OWNER_EMAIL: '' };
  assert.equal((await handlePreflight(get(), noOwner, ctx())).status, 401);
});

test('untrusted origins cannot receive private state', async () => {
  const response = await handlePreflight(get(url, 'https://evil.example'), env(), ctx());
  assert.equal(response.status, 403);
  assert.equal(response.headers.has('Access-Control-Allow-Origin'), false);
  const malformed = { ...env(), STUDIO_ORIGIN: 'http://montanamusicproduction.com' };
  assert.equal((await handlePreflight(get(), malformed, ctx())).status, 403);
});

test('the live money switch cannot activate music or non-read-only routes', async () => {
  for (const path of [
    'https://preflight.example.test/v1/generate',
    'https://preflight.example.test/v1/usage',
    'https://preflight.example.test/health',
    'https://preflight.example.test/v1/audio/asset123456'
  ]) {
    assert.equal((await handlePreflight(get(path), env(), ctx())).status, 404);
  }
  assert.equal((await handlePreflight(
    new Request(url, { method: 'POST', headers: { Origin: origin } }),
    env(), ctx())).status, 405);
});

test('missing bindings produce boolean diagnostics with no external requests', async () => {
  const response = await handlePreflight(get(), {
    STUDIO_ORIGIN: origin, ACCESS_AUD: 'aud-123', OWNER_EMAIL: 'owner@example.test'
  }, ctx());
  assert.equal(response.status, 200);
  const { checks } = await response.json();
  assert.deepEqual(checks, {
    accessAuthenticated: true, originConfigured: true,
    d1Bound: false, r2Bound: false, googleKeyPresent: false
  });
});

test('case-insensitive owner identity still requires exact Access audience', async () => {
  assert.equal((await handlePreflight(get(), env(), ctx(' OWNER@EXAMPLE.TEST '))).status, 200);
});
