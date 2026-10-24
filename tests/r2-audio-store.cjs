'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPrivateR2AudioStore, keyFor } = require('../server/r2-audio-store');

const owner = 'owner@example.test';
const other = 'other@example.test';
const reservationId = 'reservation_123456789';
const bytes = new Uint8Array(2048).fill(17);

function make(options = {}) {
  const data = new Map();
  const trace = { put: 0, get: 0, inspection: 0 };
  const bucket = {
    async put(key, value, metadata) {
      trace.put++;
      data.set(key, { body: new Uint8Array(value), metadata });
      return { key };
    },
    async get(key) { trace.get++; return data.get(key) || null; }
  };
  const inspectMp3 = async () => {
    trace.inspection++;
    return { decodable: true, mimeType: 'audio/mpeg', durationSeconds: 170 };
  };
  const store = createPrivateR2AudioStore({
    bucket, inspectMp3, ...options
  });
  return { store, trace, data };
}

test('rejects missing R2 binding or actual trusted inspector', () => {
  assert.throws(() => createPrivateR2AudioStore({}), TypeError);
  assert.throws(() => createPrivateR2AudioStore({
    bucket: { put() {}, get() {} }
  }), TypeError);
});

test('private keys are deterministic and never contain clear-text owner', () => {
  const key = keyFor(owner, reservationId);
  assert.match(key, /^private-music\/[0-9a-f]{64}\/reservation_123456789\.mp3$/);
  assert.equal(key.includes(owner), false);
  assert.notEqual(key, keyFor(other, reservationId));
  assert.throws(() => keyFor(owner, '../x'), /INVALID_AUDIO_ID/);
});

test('an inspected MP3 stores privately, with no lyrics or owner metadata', async () => {
  const { store, trace, data } = make();
  const result = await store.storeAudio({
    bytes, mimeType: 'audio/mpeg', userId: owner, reservationId
  });
  assert.deepEqual(result, {
    assetId: reservationId, mimeType: 'audio/mpeg', durationSeconds: 170
  });
  assert.equal(trace.put, 1);
  const entry = data.get(keyFor(owner, reservationId));
  assert.deepEqual(entry.body, bytes);
  assert.equal(entry.metadata.httpMetadata.contentType, 'audio/mpeg');
  assert.equal(entry.metadata.httpMetadata.cacheControl, 'private, no-store');
  assert.equal(JSON.stringify(entry.metadata).includes(owner), false);
});

test('invalid bytes and MIME fail before inspecting or storing', async () => {
  const { store, trace } = make();
  await assert.rejects(() => store.storeAudio({
    bytes: new Uint8Array(12), mimeType: 'audio/mpeg', userId: owner, reservationId
  }), /INVALID_AUDIO_BYTES/);
  await assert.rejects(() => store.storeAudio({
    bytes, mimeType: 'application/json', userId: owner, reservationId
  }), /INVALID_AUDIO_BYTES/);
  assert.equal(trace.inspection, 0);
  assert.equal(trace.put, 0);
});

test('failed or untrusted inspection cannot create an audio asset', async () => {
  const { store, trace } = make({
    inspectMp3: async () => ({ decodable: false, mimeType: 'audio/mpeg',
      durationSeconds: 170 })
  });
  await assert.rejects(() => store.storeAudio({
    bytes, mimeType: 'audio/mpeg', userId: owner, reservationId
  }), /AUDIO_INSPECTION_FAILED/);
  assert.equal(trace.put, 0);
});

test('only an owner-matched committed DB row permits private retrieval', async () => {
  const { store, trace } = make();
  await store.storeAudio({
    bytes, mimeType: 'audio/mpeg', userId: owner, reservationId
  });
  let row = null;
  let received = [];
  const db = {
    prepare() {
      return { bind: (...args) => {
        received = args;
        return { first: async () => row };
      } };
    }
  };
  assert.equal(await store.getOwnedAudio({
    userId: owner, assetId: reservationId, db
  }), null);
  assert.deepEqual(received, [owner, reservationId]);
  assert.equal(trace.get, 0);
  row = { reservation_id: reservationId };
  const object = await store.getOwnedAudio({
    userId: owner, assetId: reservationId, db
  });
  assert.deepEqual(object.body, bytes);
  assert.equal(trace.get, 1);
  // A valid id with another identity never resolves this owner's object.
  assert.equal(await store.getOwnedAudio({
    userId: other, assetId: reservationId, db
  }), null);
});

test('failed R2 writes cannot claim generation succeeded', async () => {
  const { store } = make({
    bucket: { put: async () => null, get: async () => null }
  });
  await assert.rejects(() => store.storeAudio({
    bytes, mimeType: 'audio/mpeg', userId: owner, reservationId
  }), /PRIVATE_STORAGE_FAILED/);
});
