'use strict';
const { createHash } = require('node:crypto');

// Server-side contract only. Not an HTTP endpoint, AI model, or billing system.
// All adapters must be implemented on a private, authenticated backend.
const INPUT_KEYS = new Set([
  'requestId', 'prompt', 'style', 'mode', 'durationSeconds',
  'language', 'confirmsRights', 'consentToSendPrompt'
]);
const MODES = new Set(['instrumental', 'vocal']);
const LANGUAGES = new Set(['es', 'en']);
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ASSET_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{7,127}$/;
const MIME_TYPES = new Set(['audio/wav', 'audio/mpeg', 'audio/flac']);

class MusicGenerationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'MusicGenerationError';
    this.code = code;
  }
}

function fail(code) { throw new MusicGenerationError(code); }

function isRecord(value) {
  return value !== null && typeof value === 'object' &&
    !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function validateRequest(input) {
  if (!isRecord(input) || Object.keys(input).some(key => !INPUT_KEYS.has(key))) fail('INVALID_REQUEST');
  if (typeof input.requestId !== 'string' || !ID_RE.test(input.requestId)) fail('INVALID_REQUEST');
  if (typeof input.prompt !== 'string' || input.prompt.trim().length < 10 ||
      input.prompt.length > 1400 || /[\u0000-\u001f\u007f]/.test(input.prompt)) fail('INVALID_REQUEST');
  if (input.style !== undefined && (typeof input.style !== 'string' ||
      input.style.length > 240 || /[\u0000-\u001f\u007f]/.test(input.style))) fail('INVALID_REQUEST');
  if (!MODES.has(input.mode) || !Number.isInteger(input.durationSeconds) ||
      input.durationSeconds < 15 || input.durationSeconds > 180) fail('INVALID_REQUEST');
  if (input.language !== undefined && !LANGUAGES.has(input.language)) fail('INVALID_REQUEST');
  if (input.confirmsRights !== true || input.consentToSendPrompt !== true) fail('CONSENT_REQUIRED');
  return Object.freeze({
    requestId: input.requestId.toLowerCase(), prompt: input.prompt.trim(),
    style: (input.style || '').trim(), mode: input.mode,
    durationSeconds: input.durationSeconds, language: input.language || 'es'
  });
}

function validateAsset(value) {
  // This is a server-stored *opaque ID*, never a provider URL or audio bytes.
  if (!isRecord(value) || !ASSET_RE.test(value.assetId || '') ||
      !MIME_TYPES.has(value.mimeType) ||
      !Number.isFinite(value.durationSeconds) ||
      value.durationSeconds <= 0 || value.durationSeconds > 360) fail('INVALID_PROVIDER_RESULT');
  return Object.freeze({ assetId: value.assetId, mimeType: value.mimeType,
    durationSeconds: value.durationSeconds });
}

function createMusicGenerationService({ authenticate, screen, quota, provider }) {
  if (typeof authenticate !== 'function' || typeof screen !== 'function' ||
      !quota || typeof quota.reserve !== 'function' ||
      typeof quota.commit !== 'function' || typeof quota.release !== 'function' ||
      !provider || typeof provider.generate !== 'function') {
    throw new TypeError('A trusted authentication, screening, quota and provider adapter are required');
  }

  return Object.freeze({
    async generate(rawRequest, trustedServerContext) {
      // Never derive principal, plan, price or provider credentials from rawRequest.
      let principal;
      try { principal = await authenticate(trustedServerContext); } catch (_) { fail('UNAUTHORIZED'); }
      if (!principal || typeof principal.userId !== 'string' || !principal.userId ||
          principal.canGenerate !== true) fail('UNAUTHORIZED');

      const request = validateRequest(rawRequest);
      let screening;
      try { screening = await screen(request, principal); } catch (_) { fail('POLICY_UNAVAILABLE'); }
      if (!screening || screening.allowed !== true) fail('POLICY_DENIED');

      // reserve() MUST atomically enforce owner+idempotency key, quotas and a
      // server-configured money ceiling. A client-supplied price is never accepted.
      // A repeated idempotency key with *different* content must be rejected
      // by the durable quota store, not mistaken for a valid replay.
      const fingerprint = createHash('sha256').update(JSON.stringify(request)).digest('hex');
      let ticket;
      try { ticket = await quota.reserve({ userId: principal.userId, requestId: request.requestId,
        fingerprint, durationSeconds: request.durationSeconds, mode: request.mode }); }
      catch (_) { fail('QUOTA_UNAVAILABLE'); }
      if (!ticket || !['reserved', 'denied', 'pending', 'replay'].includes(ticket.status)) fail('QUOTA_UNAVAILABLE');
      if (ticket.status === 'denied') fail('QUOTA_EXCEEDED');
      if (ticket.status === 'pending') fail('ALREADY_IN_PROGRESS');
      if (ticket.status === 'replay') return validateAsset(ticket.asset);
      if (typeof ticket.reservationId !== 'string' || !ASSET_RE.test(ticket.reservationId)) fail('QUOTA_UNAVAILABLE');

      let asset;
      try {
        asset = await provider.generate(request, {
          reservationId: ticket.reservationId, userId: principal.userId
        });
      } catch (err) {
        // Charge status is unknown on network failures/timeouts. Only the
        // trusted adapter can attest a request never incurred provider cost.
        if (!err || err.noCharge !== true) fail('RECONCILIATION_REQUIRED');
        try { await quota.release(ticket.reservationId); }
        catch (_) { fail('RECONCILIATION_REQUIRED'); }
        fail('GENERATION_FAILED');
      }

      // A malformed response does not prove that generation was free.
      try { asset = validateAsset(asset); }
      catch (_) { fail('RECONCILIATION_REQUIRED'); }

      // If settlement fails after a generation, never refund automatically:
      // the external provider might already have billed for the output.
      try { await quota.commit(ticket.reservationId, asset); }
      catch (_) { fail('RECONCILIATION_REQUIRED'); }
      return asset;
    }
  });
}

module.exports = { MusicGenerationError, validateRequest, validateAsset, createMusicGenerationService };
