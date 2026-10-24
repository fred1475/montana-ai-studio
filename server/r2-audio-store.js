'use strict';

// Private R2 asset adapter. This is NOT an audio decoder or public download API.
// The caller MUST inject an actual trusted MP3 decoder/inspector, or fail closed.
const { createHash } = require('node:crypto');
const RESERVATION_RE = /^[A-Za-z0-9_-]{8,128}$/;
const MAX_MP3_BYTES = 20 * 1024 * 1024;

function idHash(userId) {
  if (typeof userId !== 'string' || userId.length < 1 || userId.length > 200) {
    throw new Error('INVALID_AUDIO_OWNER');
  }
  return createHash('sha256').update(userId).digest('hex');
}

function keyFor(userId, reservationId) {
  if (typeof reservationId !== 'string' || !RESERVATION_RE.test(reservationId)) {
    throw new Error('INVALID_AUDIO_ID');
  }
  return 'private-music/' + idHash(userId) + '/' + reservationId + '.mp3';
}

function createPrivateR2AudioStore({ bucket, inspectMp3 } = {}) {
  if (!bucket || typeof bucket.put !== 'function' || typeof bucket.get !== 'function' ||
      typeof inspectMp3 !== 'function') {
    throw new TypeError('Private R2 binding and trusted MP3 inspector are required');
  }

  return Object.freeze({
    async storeAudio({ bytes, mimeType, userId, reservationId } = {}) {
      // Never trust the model's declared duration or MIME in place of decoding.
      // Provider response only reaches this method from trusted server code.
      const key = keyFor(userId, reservationId);
      if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1024 ||
          bytes.byteLength > MAX_MP3_BYTES || mimeType !== 'audio/mpeg') {
        throw new Error('INVALID_AUDIO_BYTES');
      }

      let inspection;
      try { inspection = await inspectMp3(bytes); }
      catch (_) { throw new Error('AUDIO_INSPECTION_FAILED'); }
      if (!inspection || inspection.decodable !== true ||
          inspection.mimeType !== 'audio/mpeg' ||
          !Number.isFinite(inspection.durationSeconds) ||
          inspection.durationSeconds < 1 || inspection.durationSeconds > 360) {
        throw new Error('AUDIO_INSPECTION_FAILED');
      }

      // R2 bucket must remain private, with its public URL and custom domain off.
      // Keep object key and metadata free of clear-text identifiers, lyrics,
      // prompts, secrets and unissued URLs. R2 provides managed encryption at rest.
      const uploaded = await bucket.put(key, bytes, {
        httpMetadata: {
          contentType: 'audio/mpeg',
          cacheControl: 'private, no-store'
        }
      });
      if (!uploaded) throw new Error('PRIVATE_STORAGE_FAILED');
      return Object.freeze({
        assetId: reservationId,
        mimeType: 'audio/mpeg',
        durationSeconds: inspection.durationSeconds
      });
    },

    async getOwnedAudio({ userId, assetId, db } = {}) {
      // Authorization requires the SAME trusted principal used to generate.
      // Do not expose this method through a public route without real Access.
      const key = keyFor(userId, assetId);
      if (!db || typeof db.prepare !== 'function') {
        throw new Error('PRIVATE_DATABASE_REQUIRED');
      }
      const row = await db.prepare(
        "SELECT reservation_id FROM reservations WHERE user_id=? AND asset_id=? AND state='committed'"
      ).bind(userId, assetId).first();
      if (!row || row.reservation_id !== assetId) return null;
      const object = await bucket.get(key);
      return object || null;
    }
  });
}

module.exports = { createPrivateR2AudioStore, keyFor };
