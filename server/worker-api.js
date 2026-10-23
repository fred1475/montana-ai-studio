'use strict';

// Private HTTP gateway for Cloudflare Workers. Intentionally not a deployable
// worker entry point: the operator must supply reviewed policy and provider
// adapters before the live generation path can be enabled.
const { createMusicGenerationService, MusicGenerationError } = require('./music-generation');
const { createD1Quota } = require('./d1-quota');

const MAX_JSON_BYTES = 32 * 1024;
const LIVE_FLAG = 'YES_I_APPROVE_REAL_GENERATION_COSTS';
const COST_LIMIT_CENTS = 1000;
const COST_PER_SONG_CENTS = 8;
const MAX_SERVED_MP3_BYTES = 20 * 1024 * 1024;
const AUDIO_PATH = /^\/v1\/audio\/([A-Za-z0-9][A-Za-z0-9_-]{7,127})$/;
const ERROR_STATUS = Object.freeze({
  UNAUTHORIZED: 401,
  INVALID_REQUEST: 400,
  CONSENT_REQUIRED: 400,
  POLICY_DENIED: 403,
  POLICY_UNAVAILABLE: 503,
  QUOTA_UNAVAILABLE: 503,
  QUOTA_EXCEEDED: 429,
  ALREADY_IN_PROGRESS: 409,
  GENERATION_FAILED: 502,
  RECONCILIATION_REQUIRED: 503
});

function configuredOrigin(env) {
  if (typeof env?.STUDIO_ORIGIN !== 'string') return null;
  try {
    const url = new URL(env.STUDIO_ORIGIN);
    if (url.protocol !== 'https:' || url.origin !== env.STUDIO_ORIGIN ||
        url.username || url.password || url.search || url.hash) return null;
    return url.origin;
  } catch (_) { return null; }
}

function headers(origin, requestOrigin) {
  const h = new Headers({
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Vary': 'Origin'
  });
  if (origin && requestOrigin === origin) {
    h.set('Access-Control-Allow-Origin', origin);
    h.set('Access-Control-Allow-Credentials', 'true');
    h.set('Access-Control-Allow-Headers', 'Content-Type');
    h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  return h;
}

function json(payload, status, origin, requestOrigin) {
  const h = headers(origin, requestOrigin);
  h.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(payload), { status, headers: h });
}

async function readJsonLimited(request) {
  const contentType = request.headers.get('content-type') || '';
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) {
    throw new Error('UNSUPPORTED_CONTENT_TYPE');
  }
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES)) {
    throw new Error('BODY_TOO_LARGE');
  }
  if (!request.body) throw new Error('INVALID_JSON');
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_JSON_BYTES) {
        await reader.cancel();
        throw new Error('BODY_TOO_LARGE');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (_) {
    throw new Error('INVALID_JSON');
  }
}

async function accessPrincipal(ctx, env) {
  // Access is authoritative only for directly authenticated Worker requests.
  // Caller-provided email, JWT text and X-User headers are never trusted.
  if (!ctx?.access || typeof ctx.access.getIdentity !== 'function' ||
      typeof ctx.access.aud !== 'string' ||
      typeof env?.ACCESS_AUD !== 'string' || !env.ACCESS_AUD ||
      ctx.access.aud !== env.ACCESS_AUD ||
      typeof env?.OWNER_EMAIL !== 'string' || !env.OWNER_EMAIL) return null;
  try {
    const identity = await ctx.access.getIdentity();
    const email = identity?.email?.trim().toLowerCase();
    if (!email || email !== env.OWNER_EMAIL.trim().toLowerCase()) return null;
    return { userId: email, canGenerate: true };
  } catch (_) { return null; }
}

function createPrivateMusicGateway({
  quotaFactory = db => createD1Quota({
    db, monthlyLimitCents: COST_LIMIT_CENTS, requestCostCents: COST_PER_SONG_CENTS
  }),
  policyScreen,
  providerFactory,
  audioStoreFactory
} = {}) {
  if (typeof quotaFactory !== 'function') throw new TypeError('quotaFactory required');

  return Object.freeze({
    async fetch(request, env, ctx) {
      const origin = configuredOrigin(env);
      const requestOrigin = request.headers.get('origin');
      let path;
      try { path = new URL(request.url).pathname; }
      catch (_) { return json({ error: 'NOT_FOUND' }, 404, origin, requestOrigin); }

      if (path === '/health' && request.method === 'GET') {
        return json({ service: 'montana-ai-studio-private-gateway',
          liveGeneration: false }, 200, origin, requestOrigin);
      }
      const audioMatch = AUDIO_PATH.exec(path);
      if (path !== '/v1/usage' && path !== '/v1/generate' && !audioMatch) {
        return json({ error: 'NOT_FOUND' }, 404, origin, requestOrigin);
      }
      if (!origin) return json({ error: 'SERVICE_NOT_CONFIGURED' }, 503, origin, requestOrigin);
      if (requestOrigin && requestOrigin !== origin) {
        return json({ error: 'ORIGIN_DENIED' }, 403, origin, requestOrigin);
      }
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: headers(origin, requestOrigin) });
      }
      if ((path === '/v1/usage' && request.method !== 'GET') ||
          (path === '/v1/generate' && request.method !== 'POST') ||
          (audioMatch && request.method !== 'GET')) {
        return json({ error: 'METHOD_NOT_ALLOWED' }, 405, origin, requestOrigin);
      }

      const principal = await accessPrincipal(ctx, env);
      if (!principal) return json({ error: 'UNAUTHORIZED' }, 401, origin, requestOrigin);
      if (!env?.DB) return json({ error: 'SERVICE_NOT_CONFIGURED' }, 503, origin, requestOrigin);

      let quota;
      try { quota = quotaFactory(env.DB); }
      catch (_) { return json({ error: 'SERVICE_NOT_CONFIGURED' }, 503, origin, requestOrigin); }

      if (path === '/v1/usage') {
        try {
          const usage = await quota.usage();
          return json({ limitCents: usage.limitCents,
            spentCents: usage.spentCents, reservedCents: usage.reservedCents,
            remainingCents: Math.max(0, usage.limitCents - usage.spentCents - usage.reservedCents)
          }, 200, origin, requestOrigin);
        } catch (_) {
          return json({ error: 'QUOTA_UNAVAILABLE' }, 503, origin, requestOrigin);
        }
      }

      // Private playback/download by owner only; generation can remain disabled.
      // Require a browser fetch with credentials and exact Origin (not a public
      // <audio src> or a shareable R2 URL). Deliberately serve only whole MP3s.
      if (audioMatch) {
        if (requestOrigin !== origin) {
          return json({ error: 'ORIGIN_REQUIRED' }, 403, origin, requestOrigin);
        }
        if (request.headers.has('range')) {
          return json({ error: 'RANGE_NOT_SUPPORTED' }, 416, origin, requestOrigin);
        }
        if (typeof audioStoreFactory !== 'function') {
          return json({ error: 'AUDIO_NOT_CONFIGURED' }, 503, origin, requestOrigin);
        }
        try {
          const storage = audioStoreFactory(env);
          if (!storage || typeof storage.getOwnedAudio !== 'function') {
            throw new Error('AUDIO_STORE_UNAVAILABLE');
          }
          const object = await storage.getOwnedAudio({
            db: env.DB, userId: principal.userId, assetId: audioMatch[1]
          });
          if (!object) {
            return json({ error: 'AUDIO_NOT_FOUND' }, 404, origin, requestOrigin);
          }
          if (!Number.isSafeInteger(object.size) || object.size < 1024 ||
              object.size > MAX_SERVED_MP3_BYTES ||
              object.httpMetadata?.contentType !== 'audio/mpeg' ||
              !object.body || typeof object.body.getReader !== 'function') {
            throw new Error('AUDIO_OBJECT_INVALID');
          }
          const responseHeaders = headers(origin, requestOrigin);
          responseHeaders.set('Content-Type', 'audio/mpeg');
          responseHeaders.set('Content-Length', String(object.size));
          responseHeaders.set('Content-Disposition', 'inline; filename="montana-ai-studio.mp3"');
          return new Response(object.body, { status: 200, headers: responseHeaders });
        } catch (_) {
          return json({ error: 'AUDIO_UNAVAILABLE' }, 503, origin, requestOrigin);
        }
      }

      // Financial fail-closed switch. A budget cap inside D1 is not a hard
      // provider billing cap; external controls still need separate setup.
      if (env.PRIVATE_GENERATION_ENABLED !== LIVE_FLAG ||
          typeof policyScreen !== 'function' ||
          typeof providerFactory !== 'function') {
        return json({ error: 'GENERATION_NOT_ENABLED' }, 503, origin, requestOrigin);
      }
      // Require a same-origin browser request to mitigate cookie-based CSRF.
      if (requestOrigin !== origin) {
        return json({ error: 'ORIGIN_REQUIRED' }, 403, origin, requestOrigin);
      }

      let body;
      try { body = await readJsonLimited(request); }
      catch (error) {
        const code = error.message;
        return json({ error: code }, code === 'BODY_TOO_LARGE' ? 413 :
          code === 'UNSUPPORTED_CONTENT_TYPE' ? 415 : 400, origin, requestOrigin);
      }

      let provider;
      try { provider = providerFactory(env); }
      catch (_) {
        return json({ error: 'SERVICE_NOT_CONFIGURED' }, 503, origin, requestOrigin);
      }
      try {
        const service = createMusicGenerationService({
          authenticate: async () => principal,
          screen: policyScreen,
          quota,
          provider
        });
        const asset = await service.generate(body, { principal });
        return json({ asset }, 200, origin, requestOrigin);
      } catch (error) {
        const code = error instanceof MusicGenerationError ? error.code : 'INTERNAL_ERROR';
        return json({ error: code }, ERROR_STATUS[code] || 500, origin, requestOrigin);
      }
    }
  });
}

module.exports = {
  createPrivateMusicGateway, readJsonLimited, accessPrincipal,
  LIVE_FLAG, COST_LIMIT_CENTS, COST_PER_SONG_CENTS
};
