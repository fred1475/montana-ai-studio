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

module.exports = { createDecodedMp3Inspector };
