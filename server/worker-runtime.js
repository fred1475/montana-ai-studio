'use strict';

// Server-only composition root; not a deployed Worker and no live credential.
// Deliberately requires a reviewed, REAL policy adapter and audio decoder.
const { createPrivateMusicGateway } = require('./worker-api');
const { createPrivateR2AudioStore } = require('./r2-audio-store');
const { createLyriaProvider } = require('./lyria-provider');

function createCloudflareMusicRuntime({
  screen, inspectMp3, fetchImpl = globalThis.fetch, quotaFactory
} = {}) {
  if (typeof screen !== 'function' || typeof inspectMp3 !== 'function' ||
      typeof fetchImpl !== 'function') {
    throw new TypeError('Reviewed screening, actual MP3 decoding and fetch are mandatory');
  }

  return createPrivateMusicGateway({
    quotaFactory,
    policyScreen: screen,
    providerFactory: env => {
      if (!env?.R2 || typeof env.R2.put !== 'function' ||
          typeof env.R2.get !== 'function' ||
          typeof env?.LYRIA_API_KEY !== 'string' || env.LYRIA_API_KEY.length < 10) {
        throw new Error('PRIVATE_PROVIDER_NOT_CONFIGURED');
      }
      const storage = createPrivateR2AudioStore({
        bucket: env.R2, inspectMp3
      });
      return createLyriaProvider({
        apiKey: env.LYRIA_API_KEY,
        storeAudio: storage.storeAudio,
        fetchImpl
      });
    }
  });
}

module.exports = { createCloudflareMusicRuntime };
