// Montana AI Studio 2.0 — private, read-only infrastructure preflight.
// This is deliberately NOT the music-generation gateway.
const ROUTE = '/v1/preflight';

function exactHttpsOrigin(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value &&
      !url.username && !url.password && !url.search && !url.hash ? value : null;
  } catch { return null; }
}

function safeHeaders(allowedOrigin, requestOrigin) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'",
    'Referrer-Policy': 'no-referrer',
    'Vary': 'Origin'
  });
  if (allowedOrigin && requestOrigin === allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', allowedOrigin);
    headers.set('Access-Control-Allow-Credentials', 'true');
  }
  return headers;
}

function reply(payload, status, origin, requestOrigin) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: safeHeaders(origin, requestOrigin)
  });
}

async function authorized(ctx, env) {
  // Cloudflare Access identity is the sole authority. Never trust headers,
  // query parameters, localStorage, or a caller-provided email.
  const access = ctx?.access;
  if (!access || typeof access.getIdentity !== 'function' ||
      typeof access.aud !== 'string' ||
      typeof env?.ACCESS_AUD !== 'string' || !env.ACCESS_AUD ||
      access.aud !== env.ACCESS_AUD ||
      typeof env?.OWNER_EMAIL !== 'string' || !env.OWNER_EMAIL.trim()) {
    return false;
  }
  try {
    const identity = await access.getIdentity();
    return typeof identity?.email === 'string' &&
      identity.email.trim().toLowerCase() === env.OWNER_EMAIL.trim().toLowerCase();
  } catch { return false; }
}

export async function handlePreflight(request, env, ctx) {
  const origin = exactHttpsOrigin(env?.STUDIO_ORIGIN);
  const requestOrigin = request.headers.get('origin');
  let path;
  try { path = new URL(request.url).pathname; }
  catch { return reply({ error: 'NOT_FOUND' }, 404, origin, requestOrigin); }

  if (path !== ROUTE) {
    return reply({ error: 'NOT_FOUND' }, 404, origin, requestOrigin);
  }
  if (request.method !== 'GET') {
    return reply({ error: 'METHOD_NOT_ALLOWED' }, 405, origin, requestOrigin);
  }
  if (requestOrigin && requestOrigin !== origin) {
    return reply({ error: 'ORIGIN_DENIED' }, 403, origin, requestOrigin);
  }
  if (!(await authorized(ctx, env))) {
    return reply({ error: 'UNAUTHORIZED' }, 401, origin, requestOrigin);
  }

  // No calls to D1, R2 or Google are made. Return booleans only: no
  // credentials, owner addresses, project identifiers or bucket names.
  return reply({
    service: 'montana-ai-studio-private-preflight',
    liveGeneration: false,
    canGenerate: false,
    checks: {
      accessAuthenticated: true,
      originConfigured: !!origin,
      d1Bound: typeof env?.DB?.prepare === 'function' &&
        typeof env.DB.batch === 'function',
      r2Bound: typeof env?.R2?.get === 'function' &&
        typeof env.R2.put === 'function',
      googleKeyPresent: typeof env?.LYRIA_API_KEY === 'string' &&
        env.LYRIA_API_KEY.length >= 10
    }
  }, 200, origin, requestOrigin);
}

export default Object.freeze({ fetch: handlePreflight });
