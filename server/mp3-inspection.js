'use strict';

// A strict PCM verification boundary for a *genuine* MP3 decoder.
// This module is NOT itself a codec. Never pass a header parser or user
// claims as decodeMp3; the caller must inject a reviewed decoder that fully
// processes the compressed bytes and attests input consumption.
const MAX_MP3_BYTES = 20 * 1024 * 1024;

function createDecodedMp3Inspector({ decodeMp3, maxSeconds = 190 } = {}) {
  if (typeof decodeMp3 !== 'function' || !Number.isFinite(maxSeconds) ||
      maxSeconds < 1 || maxSeconds > 190) {
    throw new TypeError('A complete, reviewed MP3 decoder is mandatory');
  }

  return async function inspectMp3(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1024 ||
        bytes.byteLength > MAX_MP3_BYTES) {
      throw new Error('INVALID_COMPRESSED_AUDIO');
    }
    let decoded;
    try {
      decoded = await decodeMp3(bytes);
    } catch (_) {
      throw new Error('MP3_DECODING_FAILED');
    }
    if (!decoded || decoded.complete !== true ||
        !Number.isInteger(decoded.sampleRate) ||
        decoded.sampleRate < 8000 || decoded.sampleRate > 96000 ||
        !Array.isArray(decoded.channelData) ||
        ![1, 2].includes(decoded.channelData.length) ||
        (decoded.errors !== undefined &&
          (!Array.isArray(decoded.errors) || decoded.errors.length > 0))) {
      throw new Error('INVALID_DECODED_AUDIO');
    }

    const frames = decoded.channelData[0]?.length;
    if (!Number.isSafeInteger(frames) || frames < decoded.sampleRate ||
        frames > Math.floor(decoded.sampleRate * maxSeconds) ||
        decoded.channelData.some(channel =>
          !(channel instanceof Float32Array) || channel.length !== frames)) {
      throw new Error('INVALID_DECODED_AUDIO');
    }
    // Reject NaN, Infinity and clearly corrupt PCM. This scans all decoded
    // channels; the caller must budget CPU and memory in the final Worker.
    for (const channel of decoded.channelData) {
      for (const sample of channel) {
        if (!Number.isFinite(sample) || Math.abs(sample) > 2) {
          throw new Error('INVALID_DECODED_AUDIO');
        }
      }
    }
    return Object.freeze({
      decodable: true,
      mimeType: 'audio/mpeg',
      durationSeconds: frames / decoded.sampleRate
    });
  };
}

// Lower-memory path for a reviewed decoder that yields bounded PCM chunks.
// The decoder must attest that it consumed every compressed byte; this code
// cannot manufacture that attestation. No MP3 codec is bundled by this module.
function createStreamingMp3Inspector({ decodeMp3Chunks, maxSeconds = 190, maxChunks = 32768 } = {}) {
  if (typeof decodeMp3Chunks !== 'function' || !Number.isFinite(maxSeconds) ||
      maxSeconds < 1 || maxSeconds > 190 ||
      !Number.isSafeInteger(maxChunks) || maxChunks < 1 || maxChunks > 65536) {
    throw new TypeError('A complete streaming MP3 decoder with bounded chunks is mandatory');
  }

  return async function inspectMp3(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1024 ||
        bytes.byteLength > MAX_MP3_BYTES) {
      throw new Error('INVALID_COMPRESSED_AUDIO');
    }
    let iterator;
    let frames = 0, sampleRate = null, channels = null, chunks = 0;
    try {
      const stream = decodeMp3Chunks(bytes);
      if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
        throw new Error('INVALID_DECODER_STREAM');
      }
      iterator = stream[Symbol.asyncIterator]();
      if (!iterator || typeof iterator.next !== 'function') {
        throw new Error('INVALID_DECODER_STREAM');
      }
      for (;;) {
        const step = await iterator.next();
        if (!step || typeof step.done !== 'boolean') {
          throw new Error('INVALID_DECODER_STEP');
        }
        if (step.done) {
          const receipt = step.value;
          if (!receipt || receipt.complete !== true ||
              receipt.consumedBytes !== bytes.byteLength ||
              receipt.errors !== 0 || chunks === 0 ||
              frames < sampleRate) {
            throw new Error('INCOMPLETE_MP3_STREAM');
          }
          return Object.freeze({
            decodable: true, mimeType: 'audio/mpeg',
            durationSeconds: frames / sampleRate
          });
        }
        const chunk = step.value;
        // A defective decoder yielding tiny chunks must not monopolize Worker CPU.
        if (++chunks > maxChunks) throw new Error('TOO_MANY_PCM_CHUNKS');
        if (!chunk || !Number.isInteger(chunk.sampleRate) ||
            chunk.sampleRate < 8000 || chunk.sampleRate > 96000 ||
            !Array.isArray(chunk.channelData) ||
            ![1, 2].includes(chunk.channelData.length) ||
            (chunk.errors !== undefined &&
              (!Array.isArray(chunk.errors) || chunk.errors.length > 0))) {
          throw new Error('INVALID_PCM_CHUNK');
        }
        if (sampleRate === null) {
          sampleRate = chunk.sampleRate;
          channels = chunk.channelData.length;
        } else if (sampleRate !== chunk.sampleRate ||
                   channels !== chunk.channelData.length) {
          throw new Error('AUDIO_FORMAT_CHANGED');
        }
        const count = chunk.channelData[0]?.length;
        if (!Number.isSafeInteger(count) || count < 1 || count > 96000 ||
            frames + count > Math.floor(sampleRate * maxSeconds) ||
            chunk.channelData.some(channel =>
              !(channel instanceof Float32Array) || channel.length !== count)) {
          throw new Error('INVALID_PCM_CHUNK');
        }
        for (const channel of chunk.channelData) {
          for (const sample of channel) {
            if (!Number.isFinite(sample) || Math.abs(sample) > 2) {
              throw new Error('INVALID_PCM_CHUNK');
            }
          }
        }
        frames += count;
      }
    } catch (_) {
      throw new Error('MP3_STREAM_VALIDATION_FAILED');
    } finally {
      if (iterator && typeof iterator.return === 'function') {
        try { await iterator.return(); } catch (_) { /* preserve failure */ }
      }
    }
  };
}

module.exports = { createDecodedMp3Inspector, createStreamingMp3Inspector };
