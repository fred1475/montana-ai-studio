'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDecodedMp3Inspector } = require('../server/mp3-inspection');

const compressed = new Uint8Array(2048).fill(42);
function pcm(overrides = {}) {
  return {
    complete: true, sampleRate: 44100, errors: [],
    channelData: [
      new Float32Array(88200).fill(0.1),
      new Float32Array(88200).fill(-0.1)
    ], ...overrides
  };
}

test('a missing real decoder is a construction error', () => {
  assert.throws(() => createDecodedMp3Inspector(), TypeError);
  assert.throws(() => createDecodedMp3Inspector({
    decodeMp3: async () => pcm(), maxSeconds: 500
  }), TypeError);
});

test('duration is derived from fully decoded PCM, not prompt, header or MIME', async () => {
  let calls = 0;
  const inspect = createDecodedMp3Inspector({
    decodeMp3: async bytes => {
      calls++;
      assert.equal(bytes, compressed);
      return pcm();
    }
  });
  const checked = await inspect(compressed);
  assert.deepEqual(checked, {
    decodable: true, mimeType: 'audio/mpeg', durationSeconds: 2
  });
  assert.equal(calls, 1);
});

test('false complete attestations, partial frames and decoder errors are rejected', async () => {
  for (const output of [
    pcm({ complete: false }),
    pcm({ complete: undefined }),
    pcm({ errors: ['unexpected end of stream'] }),
    pcm({ channelData: [new Float32Array(3000)] }),
    pcm({ sampleRate: 0 }),
    pcm({ channelData: [new Float32Array(88200), new Float32Array(88199)] }),
    pcm({ channelData: [new Float32Array(88200), new Float32Array(88200), new Float32Array(88200)] })
  ]) {
    await assert.rejects(createDecodedMp3Inspector({
      decodeMp3: async () => output
    })(compressed), /INVALID_DECODED_AUDIO/);
  }
});

test('NaN, infinity and corrupted PCM cannot be accepted', async () => {
  for (const value of [NaN, Infinity, -Infinity, 9]) {
    const frame = pcm();
    frame.channelData[0][100] = value;
    await assert.rejects(createDecodedMp3Inspector({
      decodeMp3: async () => frame
    })(compressed), /INVALID_DECODED_AUDIO/);
  }
});

test('bad compressed responses and rejected decoding fail closed', async () => {
  const inspect = createDecodedMp3Inspector({ decodeMp3: async () => pcm() });
  await assert.rejects(inspect(new Uint8Array(100)), /INVALID_COMPRESSED_AUDIO/);
  await assert.rejects(inspect(new Uint8Array(21 * 1024 * 1024)),
    /INVALID_COMPRESSED_AUDIO/);
  const failing = createDecodedMp3Inspector({
    decodeMp3: async () => { throw new Error('raw decoder stack/private details'); }
  });
  await assert.rejects(failing(compressed), /MP3_DECODING_FAILED/);
});
