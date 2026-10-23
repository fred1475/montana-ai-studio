'use strict';

// Safe client contract for optional, privately hosted Lyria generation.
// No provider key, free-tier promise or auto-billing action in browser code.
(function (root) {
  const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ASSET = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
  const MAX_JSON_BYTES = 32768;
  const COST_PER_SONG_CENTS = 8;

  function normalizeOrigin(value) {
    if (typeof value !== 'string') throw new Error('SERVIDOR_NO_CONFIGURADO');
    let u;
    try { u = new URL(value); } catch (_) { throw new Error('SERVIDOR_NO_CONFIGURADO'); }
    if (u.protocol !== 'https:' || u.origin !== value || u.username || u.password) {
      throw new Error('SERVIDOR_NO_CONFIGURADO');
    }
    return u.origin;
  }

  function prepareRequest(input, createId) {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        input.confirmsRights !== true || input.consentToSendPrompt !== true ||
        input.confirmsCost !== true) throw new Error('CONSENTIMIENTO_REQUERIDO');
    const prompt = input.prompt?.trim();
    const style = (input.style || '').trim();
    const lyrics = (input.lyrics || '').trim();
    if (typeof prompt !== 'string' || prompt.length < 10 || prompt.length > 1400 ||
        /[\u0000-\u001f\u007f]/.test(prompt) ||
        typeof style !== 'string' || style.length > 1000 ||
        /[\u0000-\u001f\u007f]/.test(style) ||
        typeof lyrics !== 'string' || lyrics.length > 5000 ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(lyrics) ||
        !['instrumental', 'vocal'].includes(input.mode) ||
        (input.mode === 'instrumental' && lyrics.length > 0) ||
        !Number.isInteger(input.durationSeconds) ||
        input.durationSeconds < 15 || input.durationSeconds > 180 ||
        !['es', 'en'].includes(input.language)) {
      throw new Error('SOLICITUD_INVALIDA');
    }
    const requestId = createId();
    if (typeof requestId !== 'string' || !ID.test(requestId)) {
      throw new Error('ID_DE_SOLICITUD_INVALIDO');
    }
    return Object.freeze({
      requestId, prompt, style, lyrics,
      mode: input.mode, durationSeconds: input.durationSeconds,
      language: input.language, confirmsRights: true, consentToSendPrompt: true
    });
  }

  async function readJson(response) {
    if (!response?.body || typeof response.body.getReader !== 'function') {
      throw new Error('SERVIDOR_NO_DISPONIBLE');
    }
    const announced = response.headers?.get('content-length');
    if (announced && (!/^\d+$/.test(announced) || Number(announced) > MAX_JSON_BYTES)) {
      throw new Error('RESPUESTA_DEMASIADO_GRANDE');
    }
    let total = 0;
    const pieces = [];
    const reader = response.body.getReader();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (!(chunk.value instanceof Uint8Array)) throw new Error('RESPUESTA_INVALIDA');
        total += chunk.value.byteLength;
        if (total > MAX_JSON_BYTES) {
          await reader.cancel();
          throw new Error('RESPUESTA_DEMASIADO_GRANDE');
        }
        pieces.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(total);
    let cursor = 0;
    for (const piece of pieces) { bytes.set(piece, cursor); cursor += piece.byteLength; }
    let data;
    try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch (_) { throw new Error('RESPUESTA_INVALIDA'); }
    if (!data || Array.isArray(data) || typeof data !== 'object') {
      throw new Error('RESPUESTA_INVALIDA');
    }
    return data;
  }

  function createPrivateGenerationClient({ apiOrigin, fetchImpl = root.fetch,
    uuid = () => root.crypto.randomUUID() } = {}) {
    const origin = normalizeOrigin(apiOrigin);
    if (typeof fetchImpl !== 'function' || typeof uuid !== 'function') {
      throw new Error('SERVIDOR_NO_CONFIGURADO');
    }

    const request = (path, options = {}) => fetchImpl(origin + path, {
      mode: 'cors', credentials: 'include', cache: 'no-store', redirect: 'error',
      ...options
    });

    async function usage() {
      const response = await request('/v1/usage', { method: 'GET', headers: {
        Accept: 'application/json'
      } });
      if (response.status !== 200) throw new Error('SALDO_PRIVADO_NO_DISPONIBLE');
      const data = await readJson(response);
      const { limitCents, spentCents, reservedCents, remainingCents } = data;
      if (![limitCents, spentCents, reservedCents, remainingCents].every(
        Number.isSafeInteger
      ) || limitCents < 1 || limitCents > 1000 || spentCents < 0 ||
        reservedCents < 0 || remainingCents < 0 ||
        spentCents + reservedCents + remainingCents !== limitCents) {
        throw new Error('SALDO_PRIVADO_INVALIDO');
      }
      return Object.freeze({ limitCents, spentCents, reservedCents, remainingCents });
    }

    async function generate(input) {
      // Consent and format are checked before any network request. An
      // authenticated balance check is mandatory before trying paid generation.
      const data = prepareRequest(input, uuid);
      const budget = await usage();
      if (budget.remainingCents < COST_PER_SONG_CENTS) {
        throw new Error('PRESUPUESTO_AGOTADO');
      }
      const response = await request('/v1/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await readJson(response);
      if (response.status !== 200) {
        const codes = new Set(['GENERATION_NOT_ENABLED', 'QUOTA_EXCEEDED',
          'POLICY_DENIED', 'ALREADY_IN_PROGRESS', 'RECONCILIATION_REQUIRED',
          'CONSENT_REQUIRED', 'UNAUTHORIZED']);
        const error = typeof result.error === 'string' && codes.has(result.error) ?
          result.error : 'GENERACION_NO_DISPONIBLE';
        throw new Error(error);
      }
      const asset = result.asset;
      if (!asset || typeof asset.assetId !== 'string' ||
          !ASSET.test(asset.assetId) || asset.mimeType !== 'audio/mpeg' ||
          !Number.isFinite(asset.durationSeconds) ||
          asset.durationSeconds < 1 || asset.durationSeconds > 360) {
        throw new Error('RESULTADO_INVALIDO');
      }
      return Object.freeze({
        assetId: asset.assetId, mimeType: asset.mimeType,
        durationSeconds: asset.durationSeconds, requestId: data.requestId
      });
    }

    return Object.freeze({ usage, generate });
  }

  const api = Object.freeze({
    normalizeOrigin, prepareRequest, createPrivateGenerationClient,
    COST_PER_SONG_CENTS
  });
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && typeof root.document === 'object') root.MontanaPrivateGeneration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
