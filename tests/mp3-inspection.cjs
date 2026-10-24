'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDecodedMp3Inspector, createStreamingMp3Inspector } =
  require('../server/mp3-inspection');

const compressed = new Uint8Array(2048).fill(42);
function pcm(overrides = {}) {
  return {
    complete: true, consumedBytes: compressed.byteLength, sampleRate: 44100, errors: [],
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
    pcm({ consumedBytes: undefined }),
    pcm({ consumedBytes: compressed.byteLength - 1 }),
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

function streamWith(receipt = {
  complete: true, consumedBytes: compressed.byteLength, errors: 0
}, chunkFactory = () => ({
  sampleRate: 44100,
  channelData: [new Float32Array(44100), new Float32Array(44100)],
  errors: []
})) {
  return async function* () {
    yield chunkFactory();
    yield chunkFactory();
    return receipt;
  };
}

test('bounded streaming PCM proves full byte consumption without a full-song PCM allocation', async () => {
  assert.throws(() => createStreamingMp3Inspector(), TypeError);
  const inspect = createStreamingMp3Inspector({
    decodeMp3Chunks: bytes => {
      assert.equal(bytes, compressed);
      return streamWith()();
    }
  });
  assert.deepEqual(await inspect(compressed), {
    decodable: true, mimeType: 'audio/mpeg', durationSeconds: 2
  });
});

test('streaming inspection rejects incomplete compressed input and decode errors', async () => {
  const rejected = [
    streamWith({ complete: false, consumedBytes: compressed.byteLength, errors: 0 }),
    streamWith({ complete: true, consumedBytes: compressed.byteLength - 1, errors: 0 }),
    streamWith({ complete: true, consumedBytes: compressed.byteLength, errors: 1 }),
    streamWith(undefined, () => ({
      sampleRate: 44100, channelData: [
        new Float32Array(44100).fill(NaN), new Float32Array(44100)
      ], errors: []
    })),
    streamWith(undefined, () => ({
      sampleRate: 44100, channelData: [new Float32Array(97000)]
    }))
  ];
  for (const decodeMp3Chunks of rejected) {
    await assert.rejects(createStreamingMp3Inspector({
      decodeMp3Chunks: () => decodeMp3Chunks()
    })(compressed), /MP3_STREAM_VALIDATION_FAILED/);
  }
});

test('streaming inspection requires a real iterator and a valid completion receipt', async () => {
  const invalid = createStreamingMp3Inspector({
    decodeMp3Chunks: () => []
  });
  await assert.rejects(invalid(compressed), /MP3_STREAM_VALIDATION_FAILED/);
  const notEnough = createStreamingMp3Inspector({
    decodeMp3Chunks: async function* () {
      yield { sampleRate: 44100, channelData: [new Float32Array(100)] };
      return { complete: true, consumedBytes: compressed.byteLength, errors: 0 };
    }
  });
  await assert.rejects(notEnough(compressed), /MP3_STREAM_VALIDATION_FAILED/);
});


test('streaming decoder has a bounded chunk count and closes failed streams', async () => {
  for (const badMax of [0, -1, 1.5, 65537, Infinity, NaN]) {
    assert.throws(() => createStreamingMp3Inspector({
      decodeMp3Chunks: streamWith(), maxChunks: badMax
    }), TypeError);
  }
  const boundary = createStreamingMp3Inspector({
    decodeMp3Chunks: () => streamWith()(), maxChunks: 2
  });
  assert.equal((await boundary(compressed)).durationSeconds, 2);

  let closed = false;
  const tooMany = createStreamingMp3Inspector({
    maxChunks: 2,
    decodeMp3Chunks: async function* () {
      try {
        for (let i = 0; i < 3; i++) {
          yield {
            sampleRate: 44100,
            channelData: [new Float32Array(44100)],
            errors: []
          };
        }
        return { complete: true, consumedBytes: compressed.byteLength, errors: 0 };
      } finally { closed = true; }
    }
  });
  await assert.rejects(tooMany(compressed), /MP3_STREAM_VALIDATION_FAILED/);
  assert.equal(closed, true);
});
