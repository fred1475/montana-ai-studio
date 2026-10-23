'use strict';

// Private Node.js adapter: this module does not start a server or spend money.
// It must only be installed behind the authenticated music-generation service.
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

function noCharge(message) {
  const error = new Error(message);
  error.noCharge = true; // Failure occurred BEFORE sending any provider request.
  return error;
}

function buildLyriaPrompt(request) {
  const blocks = [
    'Compón una canción original. No imites voces de artistas reales ni reproduzcas letras protegidas.',
    'Idioma de la interpretación: ' + (request.language === 'en' ? 'inglés' : 'español puertorriqueño natural') + '.',
    'Duración objetivo aproximada: ' + request.durationSeconds + ' segundos. El tiempo exacto no está garantizado.',
    request.mode === 'instrumental'
      ? 'Solo instrumental: sin voz, palabras cantadas ni fragmentos vocales.'
      : 'Canción con interpretación vocal original.',
    'Dirección creativa:\n' + request.prompt
  ];
  if (request.style) blocks.push('Estilo, arreglos e instrumentos:\n' + request.style);
  if (request.mode === 'vocal' && request.lyrics) blocks.push('Lyrics:\n' + request.lyrics);
  return blocks.join('\n\n');
}

async function readJsonLimited(response) {
  const header = response.headers?.get?.('content-length');
  if (header && Number.isFinite(Number(header)) && Number(header) > MAX_RESPONSE_BYTES) {
    throw new Error('LYRIA_RESPONSE_TOO_LARGE');
  }
  if (!response.body || typeof response.body.getReader !== 'function') {
    throw new Error('LYRIA_STREAM_UNAVAILABLE');
  }
  const reader = response.body.getReader();
  const pieces = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error('LYRIA_RESPONSE_TOO_LARGE');
      pieces.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(pieces, size).toString('utf8'));
}

function extractMp3(result) {
  // Official Interactions REST response: model_output steps contain typed
  // content blocks, including base64 audio. Never accept a user-supplied URL.
  const steps = result?.steps;
  if (!Array.isArray(steps)) throw new Error('LYRIA_NO_AUDIO');
  const audioParts = [];
  for (const step of steps) {
    if (step?.type !== 'model_output' || !Array.isArray(step.content)) continue;
    for (const part of step.content) {
      if (part?.type === 'audio') audioParts.push(part);
    }
  }
  // Reject ambiguous multi-audio output until the library supports multiple
  // safely and the billing/storage semantics are independently reviewed.
  if (audioParts.length !== 1) throw new Error('LYRIA_AUDIO_COUNT');
  const audio = audioParts[0];
  const data = audio.data;
  const mimeType = audio.mime_type ?? audio.mimeType;
  if (mimeType !== undefined && mimeType !== 'audio/mpeg') {
    throw new Error('LYRIA_UNEXPECTED_FORMAT');
  }
  if (typeof data !== 'string' || data.length === 0 || data.length % 4 !== 0 ||
      data.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw new Error('LYRIA_INVALID_AUDIO');
  const bytes = Buffer.from(data, 'base64');
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_AUDIO_BYTES ||
      bytes.toString('base64') !== data) throw new Error('LYRIA_INVALID_AUDIO');
  // A trusted store must decode and inspect the actual audio, measure
  // duration, and persist bytes durably before returning any descriptor.
  return bytes;
}

function createLyriaProvider({ apiKey, storeAudio, fetchImpl = globalThis.fetch, timeoutMs = 120000 } = {}) {
  if (typeof storeAudio !== 'function' || typeof fetchImpl !== 'function' ||
      !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300000) {
    throw new TypeError('A trusted audio store, fetch and timeout are required');
  }

  return Object.freeze({
    async generate(request, context) {
      if (typeof apiKey !== 'string' || apiKey.trim().length < 10) {
        throw noCharge('LYRIA_NOT_CONFIGURED');
      }
      if (!request || !['instrumental', 'vocal'].includes(request.mode) ||
          (request.mode === 'instrumental' && request.lyrics) ||
          !context || typeof context.userId !== 'string' ||
          typeof context.reservationId !== 'string') {
        throw noCharge('LYRIA_INVALID_INPUT');
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let payload;
      try {
        const response = await fetchImpl(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({ model: 'lyria-3.5', input: buildLyriaPrompt(request) }),
          signal: controller.signal
        });
        // After any provider request, billing status is uncertain: never mark
        // HTTP errors, timeouts or malformed responses as noCharge.
        if (!response?.ok) throw new Error('LYRIA_PROVIDER_REJECTED');
        payload = await readJsonLimited(response);
      } finally {
        clearTimeout(timeout);
      }

      const bytes = extractMp3(payload);
      // Failures here are also financially ambiguous; the quota reservation
      // remains pending for reconciliation by the owning server.
      return storeAudio({
        bytes,
        mimeType: 'audio/mpeg',
        userId: context.userId,
        reservationId: context.reservationId,
        model: 'lyria-3.5'
      });
    }
  });
}

module.exports = { buildLyriaPrompt, createLyriaProvider };
